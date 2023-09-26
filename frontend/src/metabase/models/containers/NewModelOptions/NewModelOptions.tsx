import { t } from "ttag";
import _ from "underscore";

import type { Location } from "history";
import { Grid } from "metabase/components/Grid";
import NewModelOption from "metabase/models/components/NewModelOption";

import MetabaseSettings from "metabase/lib/settings";
import * as Urls from "metabase/lib/urls";
import Databases from "metabase/entities/databases";
import { getHasDataAccess, getHasNativeWrite } from "metabase/selectors/data";

import { useSelector } from "metabase/lib/redux";
import AdminAwareEmptyState from "metabase/components/AdminAwareEmptyState";
import type Database from "metabase-lib/metadata/Database";
import {
  OptionsGridItem,
  OptionsRoot,
  EducationalButton,
} from "./NewModelOptions.styled";

const EDUCATIONAL_LINK = MetabaseSettings.learnUrl("data-modeling/models");

interface NewModelOptionsProps {
  databases?: Database[];
  location: Location;
}

const NewModelOptions = (props: NewModelOptionsProps) => {
  const hasDataAccess = useSelector(() =>
    getHasDataAccess(props.databases ?? []),
  );
  const hasNativeWrite = useSelector(() =>
    getHasNativeWrite(props.databases ?? []),
  );

  const collectionId = Urls.extractEntityId(
    props.location.query.collectionId as string,
  );

  if (!hasDataAccess && !hasNativeWrite) {
    return (
      <div className="full-height flex align-center justify-center">
        <NoDatabasesEmptyState />
      </div>
    );
  }

  // Determine how many items will be shown based on permissions etc so we can make sure the layout adapts
  const itemsCount = (hasDataAccess ? 1 : 0) + (hasNativeWrite ? 1 : 0);

  return (
    <OptionsRoot data-testid="new-model-options">
      <Grid className="justifyCenter">
        {hasDataAccess && (
          <OptionsGridItem itemsCount={itemsCount}>
            <NewModelOption
              image="app/img/notebook_mode_illustration"
              title={t`Use the notebook editor`}
              description={t`This automatically inherits metadata from your source tables, and gives your models drill-through.`}
              width={180}
              to={Urls.newQuestion({
                mode: "query",
                creationType: "custom_question",
                dataset: true,
                collectionId,
              })}
              data-metabase-event="New Model; Custom Question Start"
            />
          </OptionsGridItem>
        )}
        {hasNativeWrite && (
          <OptionsGridItem itemsCount={itemsCount}>
            <NewModelOption
              image="app/img/sql_illustration"
              title={t`Use a native query`}
              description={t`You can always fall back to a SQL or native query, which is a bit more manual.`}
              to={Urls.newQuestion({
                mode: "query",
                type: "native",
                creationType: "native_question",
                dataset: true,
                collectionId,
              })}
              width={180}
              data-metabase-event="New Model; Native Query Start"
            />
          </OptionsGridItem>
        )}
      </Grid>

      <EducationalButton
        target="_blank"
        href={EDUCATIONAL_LINK}
        className="mt4"
      >
        {t`What's a model?`}
      </EducationalButton>
    </OptionsRoot>
  );
};
const NoDatabasesEmptyState = () => (
  <AdminAwareEmptyState
    title={t`Metabase is no fun without any data`}
    adminMessage={t`Your databases will appear here once you connect one`}
    message={t`Databases will appear here once your admins have added some`}
    image="app/assets/img/databases-list"
    adminAction={t`Connect a database`}
    adminLink="/admin/databases/create"
  />
);
// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Databases.loadList({
    loadingAndErrorWrapper: false,
  }),
)(NewModelOptions);
