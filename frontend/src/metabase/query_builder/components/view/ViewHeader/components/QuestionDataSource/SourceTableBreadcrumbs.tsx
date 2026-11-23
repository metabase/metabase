import type { ReactElement } from "react";

import { skipToken, useGetTableQuery } from "metabase/api";
import { TableInfoIcon } from "metabase/common/components/MetadataInfo/TableInfoIcon/TableInfoIcon";
import { getPickerCollectionName } from "metabase/common/components/Pickers/utils";
import { useNavVariant } from "metabase/nav/prototype/use-nav-variant";
import * as Urls from "metabase/urls";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { HeadBreadcrumbs } from "../HeaderBreadcrumbs/HeaderBreadcrumbs";
import HeaderS from "../HeaderBreadcrumbs/HeaderBreadcrumbs.module.css";

import { DataSourceCrumbs } from "./DataSourceCrumbs";
import S from "./QuestionDataSource.module.css";

type SourceTableBreadcrumbsProps = {
  className?: string;
  question: Question;
  variant: "head" | "subhead";
  divider?: ReactElement | string;
  isObjectDetail?: boolean;
};

export function SourceTableBreadcrumbs({
  className,
  question,
  variant,
  divider,
  isObjectDetail,
}: SourceTableBreadcrumbsProps) {
  const query = question.query();
  const tableId = Lib.primarySourceTableId(query);
  const isSubhead = variant === "subhead";
  const hasTableLink = isSubhead || isObjectDetail;
  const { variant: navVariant } = useNavVariant();

  const { data: table, isLoading } = useGetTableQuery(
    tableId != null ? { id: tableId } : skipToken,
  );

  if (table == null || isLoading) {
    return null;
  }

  const collection = table.collection;
  if (collection == null) {
    return (
      <DataSourceCrumbs
        className={className}
        question={question}
        variant={variant}
        divider={divider}
        isObjectDetail={isObjectDetail}
      />
    );
  }

  return (
    <HeadBreadcrumbs
      className={className}
      variant={variant}
      divider={divider}
      parts={[
        <HeadBreadcrumbs.Breadcrumb
          key="collection"
          to={Urls.collection(collection)}
          icon={
            // PROTOTYPE: "Modern nav - C" marks the Library's Datasets (and
            // its subfolders) with its Data icon.
            navVariant === "modern-nav-c" && collection.type === "library-data"
              ? "grid_2x2_check"
              : "repository"
          }
        >
          {/* PROTOTYPE: the Library's sections use the nav's names. */}
          {getPickerCollectionName(collection)}
        </HeadBreadcrumbs.Breadcrumb>,
        <HeadBreadcrumbs.Breadcrumb
          key="name"
          to={
            hasTableLink
              ? Urls.queryBuilderTable(table.id, table.db_id)
              : undefined
          }
          color={isSubhead ? "text-secondary" : "text-primary"}
        >
          <span>
            {table.display_name}
            {!isSubhead && (
              <span className={S.IconWrapper}>
                <TableInfoIcon
                  table={table}
                  icon="info"
                  size={16}
                  position="bottom"
                  className={HeaderS.HeaderBadgeIcon}
                />
              </span>
            )}
          </span>
        </HeadBreadcrumbs.Breadcrumb>,
      ]}
    />
  );
}
