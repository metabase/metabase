import { t } from "ttag";

import { skipToken, useGetDatabaseQuery, useGetTableQuery } from "metabase/api";
import {
  DetailPageLayout,
  DetailPanel,
} from "metabase/common/components/DetailPanel";
import { FactRowLink } from "metabase/common/components/EntityFactRail";
import { Link } from "metabase/common/components/Link";
import { getUserIsAdmin, getUserIsAnalyst } from "metabase/current-user";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { Box, Button, Code, Group } from "metabase/ui";
import * as Urls from "metabase/urls";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";

import { ModelFactRail } from "./ModelFactRail";
import { ModelFields } from "./ModelFields";
import { ModelHistory } from "./ModelHistory";
import { ModelUsedBy } from "./ModelUsedBy";

export type ModelAboutProps = {
  card: Card;
  question: Question;
};

const GRAPH_PANEL_HEIGHT = 360;

export function ModelAbout({ card, question }: ModelAboutProps) {
  const canSeeDependencies =
    useSelector((state) => getUserIsAdmin(state) || getUserIsAnalyst(state)) &&
    PLUGIN_DEPENDENCIES.isEnabled;

  return (
    <DetailPageLayout rail={<ModelFactRail card={card} />}>
      <DetailPanel
        title={t`Fields`}
        data-testid="detail-panel-fields"
        actions={
          <Button
            component={Link}
            to={Urls.model(card)}
            variant="subtle"
            size="compact-sm"
          >
            {t`See the data`}
          </Button>
        }
      >
        <ModelFields fields={card.result_metadata ?? []} />
      </DetailPanel>

      <DetailPanel
        title={t`Definition`}
        actions={
          card.can_write && (
            <Button
              component={Link}
              to={Urls.modelEditor(card, { type: "query" })}
              variant="subtle"
              size="compact-sm"
            >
              {t`Edit`}
            </Button>
          )
        }
      >
        <ModelDefinition card={card} question={question} />
      </DetailPanel>

      {canSeeDependencies ? (
        <DetailPanel flush title={t`Used by`}>
          <PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider
            value={{
              baseUrl: Urls.modelDetail(card),
              defaultEntry: { id: card.id, type: "card" },
            }}
          >
            <Box h={GRAPH_PANEL_HEIGHT}>
              <PLUGIN_DEPENDENCIES.DependencyGraphPage />
            </Box>
          </PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider>
        </DetailPanel>
      ) : (
        <DetailPanel title={t`Used by`}>
          <ModelUsedBy modelId={card.id} />
        </DetailPanel>
      )}

      <DetailPanel title={t`History`}>
        <Box maw={800}>
          <ModelHistory card={card} />
        </Box>
      </DetailPanel>
    </DetailPageLayout>
  );
}

function ModelDefinition({
  card,
  question,
}: {
  card: Card;
  question: Question;
}) {
  const query = question.query();
  const { isNative } = Lib.queryDisplayInfo(query);

  const { data: database } = useGetDatabaseQuery(
    card.database_id != null ? { id: card.database_id } : skipToken,
  );
  const { data: table } = useGetTableQuery(
    card.table_id != null ? { id: card.table_id } : skipToken,
  );

  if (isNative) {
    return <Code block>{Lib.rawNativeQuery(query)}</Code>;
  }

  return (
    <Group gap="xs">
      {database && (
        <FactRowLink to={Urls.browseDatabase(database)}>
          {database.name}
        </FactRowLink>
      )}
      {table && (
        <FactRowLink to={Urls.browseSchema(table)}>
          {table.display_name || table.name}
        </FactRowLink>
      )}
    </Group>
  );
}
