import cx from "classnames";
import { t } from "ttag";

import TableBrowser from "metabase/browse/containers/TableBrowser";
import { BrowserCrumbs } from "metabase/components/BrowserCrumbs";
import CS from "metabase/css/core/index.css";
import Database from "metabase/entities/databases";
import Schema from "metabase/entities/schemas";
import * as Urls from "metabase/lib/urls";
import type { CollectionItem } from "metabase-types/api";

import {
  BrowseContainer,
  BrowseMain,
  BrowseSection,
} from "./BrowseContainer.styled";
import { BrowseDataHeader } from "./BrowseDataHeader";
import { BrowseHeaderContent } from "./BrowseHeader.styled";
import { SchemasTable } from "./SchemasTable";

const BrowseSchemas = ({
  schemas,
  params,
}: {
  schemas: any[];
  params: any;
}) => {
  const { slug } = params;
  const dbId = Urls.extractEntityId(slug);

  const hasTables = schemas.some(
    schema => schema.tables && schema.tables.length > 0,
  );

  return (
    <BrowseContainer data-testid="browse-schemas">
      <BrowseDataHeader />
      <BrowseMain>
        <BrowseSection direction="column">
          <>
            <BrowseHeaderContent>
              <BrowserCrumbs
                crumbs={[
                  { title: t`Databases`, to: "/browse/databases" },
                  { title: <Database.Name id={dbId} /> },
                ]}
              />
            </BrowseHeaderContent>

            {schemas.length === 0 || !hasTables ? (
              <h2 className={cx(CS.full, CS.textCentered, CS.textMedium)}>
                {t`This database doesn't have any tables.`}
              </h2>
            ) : (
              <SchemasTable schemas={schemas} />
            )}
          </>
        </BrowseSection>
      </BrowseMain>
    </BrowseContainer>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Schema.loadList({
  query: (state: any, { params: { slug } }: { params: { slug: string } }) => ({
    dbId: Urls.extractEntityId(slug),
  }),
})(BrowseSchemas);
