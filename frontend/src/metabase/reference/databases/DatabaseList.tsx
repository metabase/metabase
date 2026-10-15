import cx from "classnames";
import { Component } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { NoDatabasesEmptyState } from "metabase/common/components/NoDatabasesEmptyState";
import CS from "metabase/css/core/index.css";
import { List } from "metabase/reference/components/List";
import S from "metabase/reference/components/List/List.module.css";
import { ListItem } from "metabase/reference/components/ListItem";
import type { Database } from "metabase-types/api";

import ReferenceHeader from "../components/ReferenceHeader";

interface DatabaseListProps {
  entities: Database[];
  loading?: boolean;
  loadingError?: unknown;
}

class DatabaseList extends Component<DatabaseListProps> {
  render() {
    const { entities, loadingError, loading } = this.props;

    const databases = entities
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
            entities.length > 0 ? (
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
export default DatabaseList;
