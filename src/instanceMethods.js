// external dependencies
import debounce from 'lodash/debounce';
import isFunction from 'lodash/isFunction';
import isNumber from 'lodash/isNumber';
import isUndefined from 'lodash/isUndefined';
import noop from 'lodash/noop';
import raf from 'raf';
import {
  findDOMNode
} from 'react-dom';

// constants
import {
  OFFSET_SIZE_KEYS,
  OVERFLOW_KEYS,
  SCROLL_START_KEYS,
  ADD_EVENT_LISTENER_OPTIONS,
  VALID_TYPES
} from './constants';

// utils
import {
  areStateValuesEqual,
  getCalculatedElementEnd,
  getCalculatedItemSizeAndItemsPerRow,
  getCalculatedSpaceBefore,
  getFromAndSize,
  getFromAndSizeFromListItemSize,
  getOffset,
  getScrollSize,
  getViewportSize,
  hasDeterminateSize,
  setCacheSizes
} from './utils';

export const createGetDomNode = (instance) => {
  /**
   * @function getDomNode
   *
   * @description
   * get the DOM node of the property on the instance specified, or the instance itself
   *
   * @param {string} [property] the property on the instance requested
   * @returns {HTMLElement} the element requested
   */
  return (property) => {
    return findDOMNode(property ? instance[property] : instance);
  };
};

export const createGetItemSizeAndItemsPerRow = (instance) => {
  /**
   * @function getItemSizeAndItemsPerRow
   *
   * @description
   * get the itemSize and itemsPerRow values based on props
   *
   * @returns {{itemSize: number, itemsPerRow: number}} the itemSize and itemsPerRow
   */
  return () => {
    const {
      axis,
      useStaticSize
    } = instance.props;

    let {
      itemSize,
      itemsPerRow
    } = instance.state;

    if (useStaticSize && itemSize && itemsPerRow) {
      return {
        itemSize,
        itemsPerRow
      };
    }

    const itemElements = instance.getDomNode('items').children;

    return !itemElements.length ? {} : getCalculatedItemSizeAndItemsPerRow(itemElements, axis, itemSize);
  };
};

export const createGetScrollOffset = (instance) => {
  /**
   * @function getScrollOffset
   *
   * @description
   * get the scroll offset based on props
   *
   * @returns {number} the scrollOffset to apply
   */
  return () => {
    const {
      axis
    } = instance.props;

    const scrollKey = SCROLL_START_KEYS[axis];
    const actual = instance.scrollParent === window ?
      (document.body[scrollKey] || document.documentElement[scrollKey]) :
      instance.scrollParent[scrollKey];

    const max = getScrollSize(instance.scrollParent, axis) - getViewportSize(instance.scrollParent, axis);
    const scroll = Math.max(0, Math.min(actual, max));
    const element = instance.getDomNode();

    return getOffset(instance.scrollParent, axis) + scroll - getOffset(element, axis);
  };
};

export const createGetScrollParent = (instance) => {
  /**
   * @function getScrollParent
   *
   * @description
   * get the scroll parent element
   *
   * @returns {HTMLElement} the scroll parent
   */
  return () => {
    const {
      axis,
      scrollParentGetter
    } = instance.props;

    if (isFunction(scrollParentGetter)) {
      return scrollParentGetter();
    }

    const overflowKey = OVERFLOW_KEYS[axis];

    let element = instance.getDomNode(),
        overflowValue;

    while (element = element.parentElement) {
      overflowValue = window.getComputedStyle(element)[overflowKey];

      if (overflowValue === 'auto' || overflowValue === 'scroll' || overflowValue === 'overlay') {
        return element;
      }
    }

    return window;
  };
};

export const createGetSizeOfListItem = (instance) => {
  /**
   * @function getSizeOfListItem
   *
   * @description
   * get the size of the list item requested
   *
   * @param {number} index the index of the list item
   * @returns {number} the size of the list item
   */
  return (index) => {
    const {
      axis,
      itemSizeEstimator,
      itemSizeGetter,
      type
    } = instance.props;
    const {
      from,
      itemSize,
      size
    } = instance.state;

    // Try the static itemSize.
    if (itemSize) {
      return itemSize;
    }

    // Try the itemSizeGetter.
    if (isFunction(itemSizeGetter)) {
      return itemSizeGetter(index);
    }

    // Try the cache.
    if (!isUndefined(instance.cache[index])) {
      return instance.cache[index];
    }

    // Try the DOM.
    if (type === VALID_TYPES.SIMPLE && index >= from && index < from + size && instance.items) {
      const itemEl = instance.getDomNode('items').children[index - from];

      if (itemEl) {
        return itemEl[OFFSET_SIZE_KEYS[axis]];
      }
    }

    // Try the itemSizeEstimator.
    if (isFunction(itemSizeEstimator)) {
      return itemSizeEstimator(index, instance.cache);
    }
  };
};

export const createGetSpaceBefore = (instance) => {
  /**
   * @function getSpaceBefore
   *
   * @description
   * get the space before the item requested
   *
   * @param {number} index the index of the item requested
   * @param {Object} [cache={}] the instance cache
   * @returns {number} the space before the item requested
   */
  return (index, cache = {}) => {
    if (!isUndefined(cache[index])) {
      return cache[index];
    }

    // Try the static itemSize.
    const {
      itemSize,
      itemsPerRow
    } = instance.state;

    cache[index] = itemSize ? Math.floor(index / itemsPerRow) * itemSize :
      getCalculatedSpaceBefore(cache, index, instance.getSizeOfListItem);

    return cache[index];
  };
};

export const createGetStartAndEnd = (instance) => {
  /**
   * @function getStartAndEnd
   *
   * @description
   * get the start and end values based on scroll position
   *
   * @param {number} [threshold=this.props.threshold] the pixel threshold to scroll above and below
   * @returns {{end: number, start: number}} the start and end of the window
   */
  return (threshold = instance.props.threshold) => {
    const {
      axis,
      itemSizeGetter,
      length,
      type
    } = instance.props;

    const scroll = instance.getScrollOffset();
    const start = Math.max(0, scroll - threshold);
    const calculatedEnd = scroll + getViewportSize(instance.scrollParent, axis) + threshold;
    const end = !hasDeterminateSize(type, itemSizeGetter) ? calculatedEnd :
      Math.min(calculatedEnd, instance.getSpaceBefore(length));

    return {
      end,
      start
    };
  };
};

export const createGetVisibleRange = (instance) => {
  /**
   * @function getVisibleRange
   *
   * @description
   * get the indices of the first and last items that are visible in the viewport
   *
   * @returns {Array<number>} the first and last index of the visible items
   */
  return () => {
    const {
      from,
      size
    } = instance.state;
    const {
      end,
      start
    } = instance.getStartAndEnd(0);

    const cache = {};

    let first, last, itemStart, itemEnd,
        index = from - 1,
        length = from + size;

    while (++index < length) {
      itemStart = instance.getSpaceBefore(index, cache);
      itemEnd = itemStart + instance.getSizeOfListItem(index);

      if (isUndefined(first) && itemEnd > start) {
        first = index;
      }

      if (!isUndefined(first) && itemStart < end) {
        last = index;
      }
    }

    return [
      first,
      last
    ];
  };
};

export const createRenderItems = (instance) => {
  /**
   * @function renderItems
   *
   * @description
   * render the items that are currently visible
   *
   * @returns {ReactElement} the rendered container with the items
   */
  return () => {
    const {
      itemRenderer,
      containerRenderer
    } = instance.props;
    const {
      from,
      size
    } = instance.state;

    const items = [];

    let index = -1;

    while (++index < size) {
      items[index] = itemRenderer(from + index, index);
    }

    return containerRenderer(items, (containerRef) => {
      return instance.items = containerRef;
    });
  };
};

export const createScrollAround = (instance) => {
  /**
   * @function scrollAround
   *
   * @description
   * scroll to a point that the item is within the window, but not necessarily at the top
   *
   * @param {number} index the index to scroll to in the window
   * @returns {void}
   */
  return (index) => {
    const bottom = instance.getSpaceBefore(index);
    const top = bottom - instance.getViewportSize() + instance.getSizeOfListItem(index);

    const min = Math.min(top, bottom);
    const max = Math.max(top, bottom);
    const current = instance.getScrollOffset();

    if (current <= min) {
      return instance.setScroll(min);
    } else if (current > max) {
      return instance.setScroll(max);
    }
  };
};

export const createScrollTo = (instance) => {
  /**
   * @function scrollTo
   *
   * @description
   * scroll the element to the requested initialIndex
   *
   * @param {number} index the index to scroll to
   */
  return (index) => {
    const {
      initialIndex
    } = instance.props;

    const indexToScrollTo = isNumber(index) ? index : initialIndex;

    if (isNumber(indexToScrollTo)) {
      instance.setScroll(instance.getSpaceBefore(indexToScrollTo));
    }
  };
};

export const createSetReconcileFrameAfterUpdate = (instance) => {
  /**
   * @function setReconcileFrameAfterUpdate
   *
   * @description
   * set the frame reconciler used after componentDidUpdate
   */
  return () => {
    const {
      debounceReconciler
    } = instance.props;

    instance.reconcileFrameAfterUpdate = !isNumber(debounceReconciler) ? raf :
      debounce((updateFrame) => {
        updateFrame();
      }, debounceReconciler);
  };
};

export const createSetScroll = (instance) => {
  /**
   * @function setScroll
   *
   * @description
   * set the scroll based on the current offset
   *
   * @param {number} currentOffset the current offset
   * @returns {void}
   */
  return (currentOffset) => {
    if (!instance.scrollParent) {
      return;
    }

    const {
      axis
    } = instance.props;

    let offset = currentOffset + getOffset(instance.getDomNode(), axis);

    if (instance.scrollParent === window) {
      return window.scrollTo(0, offset);
    }

    offset -= getOffset(instance.scrollParent, axis);

    instance.scrollParent[SCROLL_START_KEYS[axis]] = offset;
  };
};

export const createSetStateIfAppropriate = (instance) => {
  /**
   * @function setStateIfAppropriate
   *
   * @description
   * set the state if areStateValuesEqual returns true
   *
   * @param {Object} nextState the possible next state of the instance
   * @param {function} callback the callback to call once the state is set
   * @returns {void}
   */
  return (nextState, callback) => {
    if (areStateValuesEqual(instance.state, nextState)) {
      return callback();
    }

    instance.setState(nextState, callback);
  };
};

export const createUpdateFrame = (instance) => {
  /**
   * @function updateFrame
   *
   * @description
   * update the frame based on the type in props
   *
   * @param {function} callback the function to call once the frame is updated
   * @returns {void}
   */
  return (callback) => {
    const {
      type
    } = instance.props;

    instance.updateScrollParent();

    if (!isFunction(callback)) {
      callback = noop;
    }

    if (type === VALID_TYPES.UNIFORM) {
      return instance.updateUniformFrame(callback);
    }

    if (type === VALID_TYPES.VARIABLE) {
      return instance.updateVariableFrame(callback);
    }

    return instance.updateSimpleFrame(callback);
  };
};

export const createUpdateScrollParent = (instance) => {
  /**
   * @function updateScrollParent
   *
   * @description
   * update the scroll parent with the listeners it needs
   *
   * @returns {void}
   */
  return () => {
    const newScrollParent = instance.getScrollParent();

    if (newScrollParent === instance.scrollParent) {
      return;
    }

    if (instance.scrollParent) {
      instance.scrollParent.removeEventListener('scroll', instance.updateFrame);
      instance.scrollParent.removeEventListener('mousewheel', noop);
    }

    instance.scrollParent = newScrollParent;

    instance.scrollParent.addEventListener('scroll', instance.updateFrame, ADD_EVENT_LISTENER_OPTIONS);
    instance.scrollParent.addEventListener('mousewheel', noop, ADD_EVENT_LISTENER_OPTIONS);
  };
};

export const createUpdateSimpleFrame = (instance) => {
  /**
   * @function updateSimpleFrame
   *
   * @description
   * update the frame when the type is 'simple'
   *
   * @param {function} callback the function to call once the frame is updated
   * @returns {void}
   */
  return (callback) => {
    const {
      end
    } = instance.getStartAndEnd();

    const itemElements = instance.getDomNode('items').children;
    const elementEnd = getCalculatedElementEnd(itemElements, instance.props);

    if (elementEnd > end) {
      return callback();
    }

    const {
      pageSize,
      length
    } = instance.props;

    const size = Math.min(instance.state.size + pageSize, length);

    instance.setStateIfAppropriate({
      size
    }, callback);
  };
};

export const createUpdateUniformFrame = (instance) => {
  /**
   * @function updateUniformFrame
   *
   * @description
   * update the frame when the type is 'uniform'
   *
   * @param {function} callback the function to call once the frame is updated
   * @returns {void}
   */
  return (callback) => {
    const itemSizeAndItemsPerRow = instance.getItemSizeAndItemsPerRow();
    const {
      itemSize,
      itemsPerRow
    } = itemSizeAndItemsPerRow;

    if (!itemSize || !itemsPerRow) {
      return callback();
    }

    const {
      start,
      end
    } = instance.getStartAndEnd();

    const calculatedFrom = Math.floor(start / itemSize) * itemsPerRow;
    const calulatedSize = (Math.ceil((end - start) / itemSize) + 1) * itemsPerRow;
    const fromAndSize = getFromAndSize(calculatedFrom, calulatedSize, itemsPerRow, instance.props);

    return instance.setStateIfAppropriate({
      ...fromAndSize,
      ...itemSizeAndItemsPerRow
    }, callback);
  };
};

export const createUpdateVariableFrame = (instance) => {
  /**
   * @function updateVariableFrame
   *
   * @description
   * update the frame when the type is 'variable'
   *
   * @param {function} callback the function to call once the frame is updated
   * @returns {void}
   */
  return (callback) => {
    const {
      axis,
      itemSizeGetter
    } = instance.props;
    const {
      from: currentFrom
    } = instance.state;

    if (!itemSizeGetter) {
      setCacheSizes(currentFrom, instance.getDomNode('items'), axis, instance.cache);
    }

    const fromAndSize = getFromAndSizeFromListItemSize(instance.getStartAndEnd(),
      instance.props, instance.getSizeOfListItem);

    instance.setStateIfAppropriate(fromAndSize, callback);
  };
};
