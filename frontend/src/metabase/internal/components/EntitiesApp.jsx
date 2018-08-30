import React from "react";
import { Route, IndexRoute } from "react-router";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import { capitalize } from "metabase/lib/formatting";

import { entities as entityDefs } from "metabase/redux/entities";

import Button from "metabase/components/Button";
import Confirm from "metabase/components/Confirm";
import Link from "metabase/components/Link";

import EntityListLoader from "metabase/entities/containers/EntityListLoader";
import EntityObjectLoader from "metabase/entities/containers/EntityObjectLoader";
import EntityForm from "metabase/entities/containers/EntityForm";

const withPush = ComposedComponent =>
  connect(null, { push })(ComposedComponent);

export default class EntitiesApp extends React.Component {
  render() {
    return (
      <div className="p2">
        {Object.values(entityDefs).map(entityDef => (
          <div key={entityDef.name}>
            <Link to={`/_internal/entities/${entityDef.name}`}>
              {capitalize(entityDef.name)}
            </Link>
          </div>
        ))}
      </div>
    );
  }
}

import { List, WindowScroller } from "react-virtualized";

const EntityListApp = ({ params: { entityType } }) => (
  <EntityListLoader entityType={entityType}>
    {({ list }) => (
      <div className="p2">
        <h2 className="pb2">{capitalize(entityType)}</h2>
        <WindowScroller>
          {({ height, isScrolling, registerChild, scrollTop }) => (
            <List
              ref={registerChild}
              autoHeight
              height={height}
              isScrolling={isScrolling}
              rowCount={list.length}
              rowHeight={20}
              width={200}
              rowRenderer={({ index, key, style }) => (
                <div key={key} style={style}>
                  <Link
                    to={`/_internal/entities/${entityType}/${list[index].id}`}
                  >
                    {entityDefs[entityType].objectSelectors.getName(
                      list[index],
                    )}
                  </Link>
                </div>
              )}
              scrollTop={scrollTop}
            />
          )}
        </WindowScroller>
        <div className="my2">
          <Link to={`/_internal/entities/${entityType}/create`}>
            <Button>Create</Button>
          </Link>
        </div>
      </div>
    )}
  </EntityListLoader>
);

const EntityObjectApp = ({ params: { entityType, entityId }, push }) => (
  <EntityObjectLoader entityType={entityType} entityId={entityId}>
    {({ object, remove }) => (
      <div className="p2">
        <h2 className="pb2">{object.name}</h2>
        <table className="Table">
          <tbody>
            {Object.entries(object).map(([key, value]) => (
              <tr key={key}>
                <td>{key}</td>
                <td>
                  {typeof value === "number" || typeof value === "string" ? (
                    value
                  ) : (
                    <pre style={{ margin: 0 }}>
                      {JSON.stringify(value, null, 2)}
                    </pre>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="my2">
          <Link to={`/_internal/entities/${entityType}/${object.id}/edit`}>
            <Button className="mr1">Edit</Button>
          </Link>
          <Confirm
            title="Delete this?"
            action={async () => {
              await remove();
              push(`/_internal/entities/${entityType}`);
            }}
          >
            <Button warning>Delete</Button>
          </Confirm>
        </div>
      </div>
    )}
  </EntityObjectLoader>
);

const EntityObjectCreateApp = ({ params: { entityType }, push }) => (
  <EntityForm
    className="p2 full"
    entityType={entityType}
    onSaved={({ id }) => push(`/_internal/entities/${entityType}/${id}`)}
  />
);
const EntityObjectEditApp = ({ params: { entityType, entityId }, push }) => (
  <EntityObjectLoader entityType={entityType} entityId={entityId}>
    {({ object }) =>
      object ? (
        <EntityForm
          className="p2 full"
          entityType={entityType}
          entityObject={object}
          onSaved={({ id }) => push(`/_internal/entities/${entityType}/${id}`)}
        />
      ) : null
    }
  </EntityObjectLoader>
);

const EntitySidebarLayout = ({ params, children }) => (
  <div className="flex flex-full">
    <div className="border-right flex-no-shrink">
      <EntityListApp params={params} />
    </div>
    <div className="flex-full">{children}</div>
  </div>
);

EntitiesApp.routes = [
  <Route path="entities">
    <IndexRoute component={EntitiesApp} />
    <Route path=":entityType">
      <IndexRoute component={EntityListApp} />,
      <Route component={EntitySidebarLayout}>
        <Route path="create" component={withPush(EntityObjectCreateApp)} />,
        <Route path=":entityId" component={withPush(EntityObjectApp)} />,
        <Route
          path=":entityId/edit"
          component={withPush(EntityObjectEditApp)}
        />
      </Route>
    </Route>
  </Route>,
];
