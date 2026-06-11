import cx from "classnames";
import type { Location } from "history";
import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { NoDatabasesEmptyState } from "metabase/common/components/NoDatabasesEmptyState";
import CS from "metabase/css/core/index.css";
import { NewModelOption } from "metabase/models/components/NewModelOption";
import { useSelector } from "metabase/redux";
import { getLearnUrl, getSetting } from "metabase/selectors/settings";
import {
  canUserCreateNativeQueries,
  canUserCreateQueries,
} from "metabase/selectors/user";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
import { Flex, Group } from "metabase/ui";
import * as Urls from "metabase/urls";

import S from "./NewModelOptions.module.css";

const EDUCATIONAL_LINK = getLearnUrl("metabase-basics/getting-started/models");

interface NewModelOptionsProps {
  location: Location;
}

const NewModelOptions = ({ location }: NewModelOptionsProps) => {
  const hasDataAccess = useSelector(canUserCreateQueries);
  const hasNativeWrite = useSelector(canUserCreateNativeQueries);

  const lastUsedDatabaseId = useSelector((state) =>
    getSetting(state, "last-used-native-database-id"),
  );

  const collectionId = Urls.extractEntityId(
    location.query.collectionId as string,
  );

  const showMetabaseLinks = useSelector(getShowMetabaseLinks);

  if (!hasDataAccess && !hasNativeWrite) {
    return (
      <div
        className={cx(CS.fullHeight, CS.flex, CS.alignCenter, CS.justifyCenter)}
      >
        <NoDatabasesEmptyState />
      </div>
    );
  }

  return (
    <Flex
      direction="column"
      justify="center"
      align="center"
      h="100%"
      my="auto"
      className={S.optionsRoot}
      data-testid="new-model-options"
    >
      <Group justify="center">
        {hasDataAccess && (
          <div>
            <NewModelOption
              image="app/img/notebook_mode_illustration"
              title={t`Use the notebook editor`}
              description={t`This automatically inherits metadata from your source tables, and gives your models drill-through.`}
              width={180}
              to={Urls.newQuestion({
                mode: "query",
                creationType: "custom_question",
                cardType: "model",
                collectionId,
              })}
            />
          </div>
        )}
        {hasNativeWrite && (
          <div>
            <NewModelOption
              image="app/img/sql_illustration"
              title={t`Use a native query`}
              description={t`You can always fall back to a SQL or native query, which is a bit more manual.`}
              to={Urls.newQuestion({
                mode: "query",
                DEPRECATED_RAW_MBQL_type: "native",
                creationType: "native_question",
                cardType: "model",
                collectionId,
                DEPRECATED_RAW_MBQL_databaseId: lastUsedDatabaseId || undefined,
              })}
              width={180}
            />
          </div>
        )}
      </Group>

      {showMetabaseLinks && (
        <ExternalLink
          target="_blank"
          href={EDUCATIONAL_LINK}
          className={cx(CS.mt4, S.educationalButton)}
        >
          {t`What's a model?`}
        </ExternalLink>
      )}
    </Flex>
  );
};
// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NewModelOptions;
