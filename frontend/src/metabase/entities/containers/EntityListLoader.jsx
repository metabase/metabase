/* @flow */

import React from "react";
import { connect } from "react-redux";
import _ from "underscore";
import { createSelector } from "reselect";

import entityType from "./EntityType";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

export type Props = {
  entityType?: string,
  entityQuery?: ?{ [key: string]: any },
  reload?: boolean,
  wrapped?: boolean,
  loadingAndErrorWrapper: boolean,
  children: (props: RenderProps) => ?React$Element<any>,
};

export type RenderProps = {
  list: ?(any[]),
  fetched: boolean,
  loading: boolean,
  error: ?any,
  reload: () => void,
};

@entityType()
@connect((state, { entityDef, entityQuery, ...props }) => {
  if (typeof entityQuery === "function") {
    entityQuery = entityQuery(state, props);
  }
  return {
    entityQuery,
    list: entityDef.selectors.getList(state, { entityQuery }),
    fetched: entityDef.selectors.getFetched(state, { entityQuery }),
    loaded: entityDef.selectors.getLoaded(state, { entityQuery }),
    loading: entityDef.selectors.getLoading(state, { entityQuery }),
    error: entityDef.selectors.getError(state, { entityQuery }),
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

  componentWillMount() {
    // $FlowFixMe: provided by @connect
    this.props.fetchList(this.props.entityQuery, { reload: this.props.reload });
  }

  componentWillReceiveProps(nextProps: Props) {
    if (!_.isEqual(nextProps.entityQuery, this.props.entityQuery)) {
      // entityQuery changed, reload
      // $FlowFixMe: provided by @connect
      nextProps.fetchList(nextProps.entityQuery, { reload: nextProps.reload });
    } else if (this.props.loaded && !nextProps.loaded && !nextProps.loading) {
      // transitioned from loaded to not loaded, and isn't yet loading again
      // this typically means the list request state was cleared by a
      // create/update/delete action
      // $FlowFixMe: provided by @connect
      nextProps.fetchList(nextProps.entityQuery);
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
      ...props,
      list: list,
      // alias the entities name:
      [entityDef.name]: list,
      reload: this.reload,
    });
  };

  render() {
    // $FlowFixMe: provided by @connect
    const { fetched, error, loadingAndErrorWrapper } = this.props;
    return loadingAndErrorWrapper ? (
      <LoadingAndErrorWrapper
        loading={!fetched}
        error={error}
        children={this.renderChildren}
      />
    ) : (
      this.renderChildren()
    );
  }

  reload = () => {
    // $FlowFixMe: provided by @connect
    return this.props.fetchList(this.props.entityQuery, { reload: true });
  };
}

export const entityListLoader = (ellProps: Props) =>
  // eslint-disable-line react/display-name
  (ComposedComponent: any) =>
    // eslint-disable-next-line react/display-name
    (props: Props) => (
      <EntityListLoader {...props} {...ellProps}>
        {childProps => <ComposedComponent {...props} {...childProps} />}
      </EntityListLoader>
    );
