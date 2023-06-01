import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import Icon from "metabase/components/Icon";

import type Question from "metabase-lib/Question";
import * as ML_Urls from "metabase-lib/urls";
import type Table from "metabase-lib/metadata/Table";

import { ModelInfoTitle, ModelInfoSection } from "./ModelInfoSidePanel.styled";
import { List, ListItemLink, ListItemName } from "./ModelRelationships.styled";

interface Props {
  model: Question;
  mainTable?: Table | null;
}

function ModelRelationships({ model, mainTable }: Props) {
  const relatedTables = useMemo(() => {
    const tablesMainTablePointsTo = model.table()?.foreignTables() || [];
    const tablesPointingToMainTable = mainTable?.connectedTables() || [];
    return _.uniq(
      [...tablesMainTablePointsTo, ...tablesPointingToMainTable],
      table => table.id,
    );
  }, [model, mainTable]);

  if (relatedTables.length === 0) {
    return null;
  }

  return (
    <ModelInfoSection>
      <ModelInfoTitle>{t`Relationships`}</ModelInfoTitle>
      <List data-testid="model-relationships">
        {relatedTables.map(table => (
          <li key={table.id}>
            <ListItemLink
              to={ML_Urls.getUrl(table.newQuestion())}
              aria-label={table.displayName()}
            >
              <Icon name="table" />
              <ListItemName>{table.displayName()}</ListItemName>
            </ListItemLink>
          </li>
        ))}
      </List>
    </ModelInfoSection>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ModelRelationships;
