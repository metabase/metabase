import cx from "classnames";
import { Component } from "react";
import { t } from "ttag";

import { List } from "metabase/common/components/List";
import S from "metabase/common/components/List/List.module.css";
import { ListItem } from "metabase/common/components/ListItem";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { NoDatabasesEmptyState } from "metabase/common/components/NoDatabasesEmptyState";
import CS from "metabase/css/core/index.css";
import { connect } from "metabase/redux";
import * as metadataActions from "metabase/redux/metadata";
import { getShallowDatabases as getDatabases } from "metabase/selectors/metadata";
import type { NormalizedDatabase } from "metabase-types/api";

import ReferenceHeader from "../components/ReferenceHeader";
import type { StateWithReference } from "../selectors";
import { getError, getLoading } from "../selectors";

interface DatabaseListProps {
  entities: Record<string, NormalizedDatabase>;
  loading?: boolean;
  loadingError?: unknown;
}

const mapStateToProps = (state: StateWithReference) => ({
  entities: getDatabases(state),
  loading: getLoading(state),
  loadingError: getError(state),
});

const mapDispatchToProps = {
  ...metadataActions,
};

class DatabaseList extends Component<DatabaseListProps> {
  render() {
    const { entities, loadingError, loading } = this.props;

    const databases = Object.values(entities)
      .filter((database) => {
        const exists = Boolean(database?.id && database?.name);
        return exists && !database.is_saved_questions;
      })
      .sort((a, b) => {
        const compared = a.name.localeCompare(b.name);
        return compared !== 0
          ? compared
          : (a.engine ?? "").localeCompare(b.engine ?? "");
      });

    return (
      <div>
        <ReferenceHeader name={t`Our data`} />
        <LoadingAndErrorWrapper
          loading={!loadingError && loading}
          error={loadingError}
        >
          {() =>
            Object.keys(entities).length > 0 ? (
              <div className={cx(CS.wrapper, CS.wrapperTrim)}>
                <List>
                  {databases.map((database) => (
                    <ListItem
                      key={database.id}
                      name={database.name}
                      description={database.description}
                      url={`/reference/databases/${database.id}`}
                      icon="database"
                    />
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(DatabaseList);
