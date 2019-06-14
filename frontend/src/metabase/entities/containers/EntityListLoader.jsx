/* @flow */

import React from "react";
import { connect } from "react-redux";
import _ from "underscore";
import { createSelector } from "reselect";
import { createMemoizedSelector } from "metabase/lib/redux";

import entityType from "./EntityType";
import paginationState from "metabase/hoc/PaginationState";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

export type Props = {
  entityType?: string,
  entityQuery?: ?{ [key: string]: any },
  reload?: boolean,
  wrapped?: boolean,
  loadingAndErrorWrapper: boolean,
  selectorName?: string,
  children: (props: RenderProps) => ?React$Element<any>,
};

export type RenderProps = {
  list: ?(any[]),
  fetched: boolean,
  loading: boolean,
  error: ?any,
  reload: () => void,
};

// props that shouldn't be passed to children in order to properly stack
const CONSUMED_PROPS: string[] = [
  "entityType",
  "entityQuery",
  // "reload", // Masked by `reload` function. Should we rename that?
  "wrapped",
  "loadingAndErrorWrapper",
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

@entityType()
@paginationState()
@connect((state, props) => {
  let {
    entityDef,
    entityQuery,
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
    entityQuery = { limit: pageSize, offset: pageSize * page, ...entityQuery };
  }
  entityQuery = getMemoizedEntityQuery(state, { entityQuery });

  const loading = entityDef.selectors.getLoading(state, { entityQuery });
  const loaded = entityDef.selectors.getLoaded(state, { entityQuery });
  const fetched = entityDef.selectors.getFetched(state, { entityQuery });
  const error = entityDef.selectors.getError(state, { entityQuery });

  return {
    entityQuery,
    list: entityDef.selectors[selectorName](state, { entityQuery }),
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
})
export default class EntityListLoader extends React.Component {
  props: Props;

  static defaultProps = {
    loadingAndErrorWrapper: true,
    reload: false,
    wrapped: false,
  };

  _getWrappedList: ?(props: Props) => any;

  constructor(props: Props) {
    super(props);

    this._getWrappedList = createSelector(
      [props => props.list, props => props.dispatch, props => props.entityDef],
      (list, dispatch, entityDef) =>
        list && list.map(object => entityDef.wrapEntity(object, dispatch)),
    );
  }

  async fetchList(
    // $FlowFixMe: fetchList provided by @connect
    { fetchList, entityQuery, pageSize, onChangeHasMorePages },
    options?: any,
  ) {
    const result = await fetchList(entityQuery, options);
    if (typeof pageSize === "number" && onChangeHasMorePages) {
      onChangeHasMorePages(
        !result.payload.result || result.payload.result.length === pageSize,
      );
    }
    return result;
  }

  componentWillMount() {
    this.fetchList(this.props, { reload: this.props.reload });
  }

  componentWillReceiveProps(nextProps: Props) {
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

  renderChildren = () => {
    // $FlowFixMe: provided by @connect
    let { children, entityDef, wrapped, list, reload, ...props } = this.props; // eslint-disable-line no-unused-vars

    if (wrapped) {
      // $FlowFixMe
      list = this._getWrappedList(this.props);
    }

    // $FlowFixMe: loading and error missing
    return children({
      ..._.omit(props, ...CONSUMED_PROPS),
      list,
      // alias the entities name:
      [entityDef.nameMany]: list,
      reload: this.reload,
    });
  };

  render() {
    // $FlowFixMe: provided by @connect
    const { allFetched, allError } = this.props;
    const { loadingAndErrorWrapper } = this.props;
    return loadingAndErrorWrapper ? (
      <LoadingAndErrorWrapper
        loading={!allFetched}
        error={allError}
        children={this.renderChildren}
        noWrapper
      />
    ) : (
      this.renderChildren()
    );
  }

  reload = () => {
    this.fetchList(this.props, { reload: true });
  };
}

export const entityListLoader = (ellProps: Props) =>
  // eslint-disable-line react/display-name
  (ComposedComponent: any) =>
    // eslint-disable-next-line react/display-name
    (props: Props) => (
      <EntityListLoader {...props} {...ellProps}>
        {childProps => (
          <ComposedComponent
            {..._.omit(props, ...CONSUMED_PROPS)}
            {...childProps}
          />
        )}
      </EntityListLoader>
    );
