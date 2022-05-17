/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";

import S from "metabase/components/List.css";

import List from "metabase/components/List";
import ListItem from "metabase/components/ListItem";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import ReferenceHeader from "../components/ReferenceHeader";

import { getDatabases, getError, getLoading } from "../selectors";

import * as metadataActions from "metabase/redux/metadata";
import NoDatabasesEmptyState from "metabase/reference/databases/NoDatabasesEmptyState";

const mapStateToProps = (state, props) => ({
  entities: getDatabases(state, props),
  loading: getLoading(state, props),
  loadingError: getError(state, props),
});

const mapDispatchToProps = {
  ...metadataActions,
};

class DatabaseList extends Component {
  static propTypes = {
    style: PropTypes.object.isRequired,
    entities: PropTypes.object.isRequired,
    loading: PropTypes.bool,
    loadingError: PropTypes.object,
  };

  render() {
    const { entities, style, loadingError, loading } = this.props;

    const databases = Object.values(entities)
      .filter(database => {
        const exists = Boolean(database?.id && database?.name);
        return exists && !database.is_saved_questions;
      })
      .sort((a, b) => {
        const compared = a.name.localeCompare(b.name);
        return compared !== 0 ? compared : a.engine.localeCompare(b.engine);
      });

    return (
      <div style={style} className="full">
        <ReferenceHeader name={t`Our data`} />
        <LoadingAndErrorWrapper
          loading={!loadingError && loading}
          error={loadingError}
        >
          {() =>
            Object.keys(entities).length > 0 ? (
              <div className="wrapper">
                <List>
                  {databases.map((database, index) => (
                    <li className="relative" key={database.id}>
                      <ListItem
                        id={database.id}
                        index={index}
                        name={database.display_name || database.name}
                        description={database.description}
                        url={`/reference/databases/${database.id}`}
                        icon="database"
                      />
                    </li>
                  ))}
                </List>
              </div>
            ) : (
              <div className={S.empty}>
                <NoDatabasesEmptyState />
              </div>
            )
          }
        </LoadingAndErrorWrapper>
      </div>
    );
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(DatabaseList);
