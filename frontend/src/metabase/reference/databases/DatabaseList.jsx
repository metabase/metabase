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

@connect(
  mapStateToProps,
  mapDispatchToProps,
)
export default class DatabaseList extends Component {
  static propTypes = {
    style: PropTypes.object.isRequired,
    entities: PropTypes.object.isRequired,
    loading: PropTypes.bool,
    loadingError: PropTypes.object,
  };

  render() {
    const { entities, style, loadingError, loading } = this.props;

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
                  {Object.values(entities).map(
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
        </LoadingAndErrorWrapper>
      </div>
    );
  }
}
