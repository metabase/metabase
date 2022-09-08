/* eslint-disable react/prop-types */
import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import _ from "underscore";
import { createSelector } from "reselect";
import { createMemoizedSelector } from "metabase/lib/redux";

import entityType from "./EntityType";
import paginationState from "metabase/hoc/PaginationState";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { capitalize } from "metabase/lib/formatting";

const propTypes = {
  entityType: PropTypes.string,
  entityQuery: PropTypes.oneOfType([PropTypes.func, PropTypes.object]),
  // We generally expect booleans here,
  // but a parent entity loader may pass `reload` as a function.
  reload: PropTypes.oneOfType([PropTypes.bool, PropTypes.func]),
  reloadInterval: PropTypes.oneOfType([PropTypes.number, PropTypes.func]),
  wrapped: PropTypes.bool,
  debounced: PropTypes.bool,
  loadingAndErrorWrapper: PropTypes.bool,
  LoadingAndErrorWrapper: PropTypes.elementType,
  keepListWhileLoading: PropTypes.bool,
  listName: PropTypes.string,
  selectorName: PropTypes.string,
  children: PropTypes.func,

  // via entityType HOC
  entityDef: PropTypes.object,

  // via react-redux connect
  list: PropTypes.arrayOf(PropTypes.object),
  metadata: PropTypes.object,
  loading: PropTypes.bool,
  loaded: PropTypes.bool,
  fetched: PropTypes.bool,
  error: PropTypes.any,
  allLoading: PropTypes.bool,
  allLoaded: PropTypes.bool,
  allFetched: PropTypes.bool,
  allError: PropTypes.bool,
  dispatch: PropTypes.func,
};

const defaultProps = {
  loadingAndErrorWrapper: true,
  LoadingAndErrorWrapper: LoadingAndErrorWrapper,
  keepListWhileLoading: false,
  reload: false,
  wrapped: false,
  debounced: false,
};

// props that shouldn't be passed to children in order to properly stack
const CONSUMED_PROPS = [
  "entityType",
  "entityQuery",
  // "reload", // Masked by `reload` function. Should we rename that?
  "reloadInterval",
  "wrapped",
  "debounced",
  "loadingAndErrorWrapper",
  "LoadingAndErrorWrapper",
  "selectorName",
];

const getEntityQuery = (state, props) =>
  typeof props.entityQuery === "function"
    ? props.entityQuery(state, props)
    : props.entityQuery;

// NOTE: Memoize entityQuery so we don't re-render even if a new but identical
// object is created. This works because entityQuery must be JSON serializable
// NOTE: Technically leaks a small amount of memory because it uses an unbounded
// memoization cache, but that's probably ok.
const getMemoizedEntityQuery = createMemoizedSelector(
  [getEntityQuery],
  entityQuery => entityQuery,
);

class EntityListLoaderInner extends React.Component {
  state = {
    previousList: [],
    isReloading: this.props.reload,
  };

  constructor(props) {
    super(props);

    this._getWrappedList = createSelector(
      [props => props.list, props => props.dispatch, props => props.entityDef],
      (list, dispatch, entityDef) =>
        list && list.map(object => entityDef.wrapEntity(object, dispatch)),
    );
  }

  maybeDebounce(f, ...args) {
    if (this.props.debounced) {
      return _.debounce(f, ...args);
    } else {
      return f;
    }
  }

  fetchList = this.maybeDebounce(
    async (
      { fetchList, entityQuery, pageSize, onChangeHasMorePages },
      options,
    ) => {
      const result = await fetchList(entityQuery, options);

      this.setState({ isReloading: false });

      if (typeof pageSize === "number" && onChangeHasMorePages) {
        onChangeHasMorePages(
          !result.payload.result || result.payload.result.length === pageSize,
        );
      }
      return result;
    },
    250,
  );

  componentDidMount() {
    const { loaded, reload, reloadInterval } = this.props;
    this.fetchList(this.props, { reload });

    if (loaded && reloadInterval) {
      this.reloadTimeout = setTimeout(this.reload, reloadInterval);
    }
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    if (!_.isEqual(nextProps.entityQuery, this.props.entityQuery)) {
      // entityQuery changed, reload
      this.fetchList(nextProps, { reload: nextProps.reload });
    } else if (this.props.loaded && !nextProps.loaded && !nextProps.loading) {
      // transitioned from loaded to not loaded, and isn't yet loading again
      // this typically means the list request state was cleared by a
      // create/update/delete action
      this.fetchList(nextProps);
    }
  }

  componentDidUpdate(prevProps) {
    const { loaded, reloadInterval, keepListWhileLoading } = this.props;
    const { previousList } = this.state;

    const shouldUpdatePrevList =
      keepListWhileLoading &&
      Array.isArray(prevProps.list) &&
      previousList !== prevProps.list;

    if (shouldUpdatePrevList) {
      this.setState({ previousList: prevProps.list });
    }

    if (loaded && !prevProps.loaded) {
      clearTimeout(this.reloadTimeout);

      if (reloadInterval) {
        this.reloadTimeout = setTimeout(this.reload, reloadInterval);
      }
    }
  }

  componentWillUnmount() {
    clearTimeout(this.reloadTimeout);
  }

  renderChildren = () => {
    const {
      children,
      entityDef,
      wrapped,
      list: currentList,
      listName = entityDef.nameMany,
      loading,
      reload, // eslint-disable-line no-unused-vars
      keepListWhileLoading,
      ...props
    } = this.props;
    const { previousList } = this.state;

    const finalList =
      keepListWhileLoading && loading ? previousList : currentList;

    const list = wrapped
      ? this._getWrappedList({ ...this.props, list: finalList })
      : finalList;

    return children({
      ..._.omit(props, ...CONSUMED_PROPS),
      list,
      loading,
      // alias the entities name:
      [listName]: list,
      reload: this.reload,
      [`reload${capitalize(listName)}`]: this.reload,
    });
  };

  render() {
    const {
      allFetched,
      allError,
      loadingAndErrorWrapper,
      LoadingAndErrorWrapper,
    } = this.props;
    const { isReloading } = this.state;

    return loadingAndErrorWrapper ? (
      <LoadingAndErrorWrapper
        loading={!allFetched || isReloading}
        error={allError}
        noWrapper
      >
        {this.renderChildren}
      </LoadingAndErrorWrapper>
    ) : (
      this.renderChildren()
    );
  }

  reload = () => {
    this.fetchList(this.props, { reload: true });
  };
}

const EntityListLoader = _.compose(
  entityType(),
  paginationState(),
  connect((state, props) => {
    let {
      entityDef,
      entityQuery,
      reloadInterval,
      page,
      pageSize,
      allLoading,
      allLoaded,
      allFetched,
      allError,
      selectorName = "getList",
    } = props;
    if (typeof entityQuery === "function") {
      entityQuery = entityQuery(state, props);
    }
    if (typeof pageSize === "number" && typeof page === "number") {
      entityQuery = {
        limit: pageSize,
        offset: pageSize * page,
        ...entityQuery,
      };
    }
    entityQuery = getMemoizedEntityQuery(state, { entityQuery });

    const list = entityDef.selectors[selectorName](state, { entityQuery });
    if (typeof reloadInterval === "function") {
      reloadInterval = reloadInterval(state, props, list);
    }

    const loading = entityDef.selectors.getLoading(state, { entityQuery });
    const loaded = entityDef.selectors.getLoaded(state, { entityQuery });
    const fetched = entityDef.selectors.getFetched(state, { entityQuery });
    const error = entityDef.selectors.getError(state, { entityQuery });
    const metadata = entityDef.selectors.getListMetadata(state, {
      entityQuery,
    });

    return {
      list,
      entityQuery,
      reloadInterval,
      metadata,
      loading,
      loaded,
      fetched,
      error,
      // merge props passed in from stacked Entity*Loaders:
      allLoading: loading || (allLoading == null ? false : allLoading),
      allLoaded: loaded && (allLoaded == null ? true : allLoaded),
      allFetched: fetched && (allFetched == null ? true : allFetched),
      allError: error || (allError == null ? null : allError),
    };
  }),
)(EntityListLoaderInner);

EntityListLoader.propTypes = propTypes;
EntityListLoader.defaultProps = defaultProps;

export default EntityListLoader;

export const entityListLoader = ellProps => ComposedComponent => {
  function WrappedComponent(props) {
    return (
      <EntityListLoader {...props} {...ellProps}>
        {childProps => (
          <ComposedComponent
            {..._.omit(props, ...CONSUMED_PROPS)}
            {...childProps}
          />
        )}
      </EntityListLoader>
    );
  }
  WrappedComponent.displayName = ComposedComponent.displayName;
  return WrappedComponent;
};
