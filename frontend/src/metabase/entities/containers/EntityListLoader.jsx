import React from "react";
import { connect } from "react-redux";

import entityType from "./EntityType";

@entityType()
@connect((state, props) => ({
  list: props.entityDef.selectors.getList(state, props),
}))
export default class EntitiesListLoader extends React.Component {
  componentWillMount() {
    this.props.fetchList();
  }
  render() {
    const { list, children } = this.props;
    return children({ list });
  }
}
