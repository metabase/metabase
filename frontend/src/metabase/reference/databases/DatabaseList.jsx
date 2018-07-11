/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";
import { isQueryable } from "metabase/lib/table";

import S from "metabase/components/List.css";

import List from "metabase/components/List.jsx";
import ListItem from "metabase/components/ListItem.jsx";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";

import ReferenceHeader from "../components/ReferenceHeader.jsx";

import EntityListLoader from "metabase/entities/containers/EntityListLoader";

import NoDatabasesEmptyState from "metabase/reference/databases/NoDatabasesEmptyState";

export default class DatabaseList extends Component {
  static propTypes = {
    style: PropTypes.object.isRequired,
  };

  render() {
    const { style } = this.props;

    return (
      <div style={style} className="full">
        <ReferenceHeader name={t`Databases and tables`} />
        <EntityListLoader entityType="databases">
          {({ databases }) =>
            databases.length > 0 ? (
              <div className="wrapper wrapper--trim">
                <List>
                  {databases.filter(isQueryable).map(
                    (entity, index) =>
                      entity &&
                      entity.id &&
                      entity.name && (
                        <li className="relative" key={entity.id}>
                          <ListItem
                            id={entity.id}
                            index={index}
                            name={entity.display_name || entity.name}
                            description={entity.description}
                            url={`/reference/databases/${entity.id}`}
                            icon="database"
                          />
                        </li>
                      ),
                  )}
                </List>
              </div>
            ) : (
              <div className={S.empty}>
                <NoDatabasesEmptyState />
              </div>
            )
          }
        </EntityListLoader>
      </div>
    );
  }
}
