import React from "react";
import { Link, Route } from "react-router";
import { connect } from "react-redux";

import { entities as entityDefs } from "metabase/redux/entities";

export default class EntitiesApp extends React.Component {
  render() {
    return (
      <div>
        {Object.entries(entityDefs).map(([name, entityDef]) => (
          <div>
            <Link to={`/_internal/entities/${name}`}>{name}</Link>
          </div>
        ))}
      </div>
    );
  }
}

const getEntityType = (state, props) => props.params.entityType;
const getEntityDef = (state, props) => entityDefs[getEntityType(state, props)];
const getEntityList = (state, props) =>
  getEntityDef(state, props).selectors.getList(state, props);
const getEntityId = (state, props) => props.params.entityId;
const getEntityObject = (state, props) =>
  getEntityDef(state, props).selectors.getObject(state, props);

@connect((state, props) => ({
  entityDef: getEntityDef(state, props),
  entityList: getEntityList(state, props),
}))
class EntitiesListApp extends React.Component {
  componentWillMount() {
    const { entityDef } = this.props;
    this.props.dispatch(entityDef.actions.list());
  }
  render() {
    const { entityDef, entityList } = this.props;
    return (
      <div>
        <h3>{entityDef.name}</h3>
        {entityList &&
          entityList.map(item => (
            <div>
              <Link to={`/_internal/entities/${entityDef.name}/${item.id}`}>
                {item[entityDef.nameProperty]}
              </Link>
            </div>
          ))}
      </div>
    );
  }
}

@connect((state, props) => ({
  entityDef: getEntityDef(state, props),
  entityId: getEntityId(state, props),
  entityObject: getEntityObject(state, props),
}))
class EntitiesObjectApp extends React.Component {
  componentWillMount() {
    const { entityDef, entityId } = this.props;
    this.props.dispatch(entityDef.actions.get(entityId));
  }
  render() {
    const { entityDef, entityObject } = this.props;
    return (
      <div>
        <h3>{entityDef.name}</h3>
        <pre>{JSON.stringify(entityObject, null, 2)}</pre>
      </div>
    );
  }
}

EntitiesApp.routes = [
  <Route path="entities" component={EntitiesApp} />,
  <Route path="entities/:entityType" component={EntitiesListApp} />,
  <Route path="entities/:entityType/:entityId" component={EntitiesObjectApp} />,
];
