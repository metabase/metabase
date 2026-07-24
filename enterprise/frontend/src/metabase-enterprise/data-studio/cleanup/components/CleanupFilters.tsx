import { skipToken } from "@reduxjs/toolkit/query";
import { t } from "ttag";

import {
  useListDatabaseSchemasQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { Flex, Icon, Select, TextInput } from "metabase/ui";
import type * as Urls from "metabase/urls";

type CleanupFiltersProps = {
  params: Urls.DataStudioCleanupParams;
  onChange: (params: Urls.DataStudioCleanupParams) => void;
  showLocationFilters?: boolean;
  showSort?: boolean;
};

export function CleanupFilters({
  params,
  onChange,
  showLocationFilters = true,
  showSort = false,
}: CleanupFiltersProps) {
  const { data: databaseResponse } = useListDatabasesQuery();
  const { data: schemas = [] } = useListDatabaseSchemasQuery(
    params.databaseId != null ? { id: params.databaseId } : skipToken,
  );

  const update = (values: Partial<Urls.DataStudioCleanupParams>) =>
    onChange({ ...params, ...values, page: undefined, candidateId: undefined });

  return (
    <Flex gap="sm" wrap="wrap">
      <TextInput
        aria-label={t`Search cleanup candidates`}
        placeholder={t`Search tables and candidates`}
        leftSection={<Icon name="search" />}
        value={params.search ?? ""}
        onChange={(event) =>
          update({ search: event.currentTarget.value || undefined })
        }
        miw="16rem"
        flex={1}
      />
      {showLocationFilters && (
        <>
          <Select
            aria-label={t`Database`}
            placeholder={t`All databases`}
            clearable
            searchable
            value={params.databaseId != null ? String(params.databaseId) : null}
            data={
              databaseResponse?.data.map((database) => ({
                value: String(database.id),
                label: database.name,
              })) ?? []
            }
            onChange={(value) =>
              update({
                databaseId: value ? Number(value) : undefined,
                schema: undefined,
              })
            }
          />
          <Select
            aria-label={t`Schema`}
            placeholder={t`All schemas`}
            clearable
            searchable
            disabled={params.databaseId == null}
            value={params.schema ?? null}
            data={schemas.map((schema) => ({ value: schema, label: schema }))}
            onChange={(value) => update({ schema: value ?? undefined })}
          />
        </>
      )}
      <Select
        aria-label={t`Entity type`}
        placeholder={t`Measures and segments`}
        clearable
        value={params.candidateType ?? null}
        data={[
          { value: "measure", label: t`Measures` },
          { value: "segment", label: t`Segments` },
        ]}
        onChange={(value) =>
          update({
            candidateType:
              value === "measure" || value === "segment" ? value : undefined,
          })
        }
      />
      <Select
        aria-label={t`Modeling status`}
        placeholder={t`All modeling statuses`}
        clearable
        value={params.modelingStatus ?? null}
        data={[
          { value: "missing", label: t`Not in Library` },
          { value: "partially-modeled", label: t`Needs review` },
          { value: "modeled", label: t`Modeled, still used raw` },
        ]}
        onChange={(value) =>
          update({
            modelingStatus:
              value === "missing" ||
              value === "partially-modeled" ||
              value === "modeled"
                ? value
                : undefined,
          })
        }
      />
      <Select
        aria-label={t`Evidence`}
        placeholder={t`Any evidence`}
        clearable
        value={params.signal ?? null}
        data={[
          { value: "verified", label: t`Verified` },
          { value: "official", label: t`Official collection` },
          { value: "popular", label: t`Popular` },
        ]}
        onChange={(value) =>
          update({
            signal:
              value === "verified" ||
              value === "official" ||
              value === "popular"
                ? value
                : undefined,
          })
        }
      />
      <Select
        aria-label={t`Dismissed candidates`}
        value={params.dismissed ?? "exclude"}
        data={[
          { value: "exclude", label: t`Active candidates` },
          { value: "only", label: t`Dismissed candidates` },
          { value: "include", label: t`All candidates` },
        ]}
        onChange={(value) =>
          update({
            dismissed:
              value === "only" || value === "include" ? value : "exclude",
          })
        }
      />
      {showSort && (
        <>
          <Select
            aria-label={t`Sort candidates`}
            value={params.sort ?? "priority"}
            data={[
              { value: "priority", label: t`Priority` },
              { value: "name", label: t`Name` },
              { value: "source-count", label: t`Source count` },
              { value: "view-count", label: t`Total views` },
            ]}
            onChange={(value) =>
              update({
                sort:
                  value === "name" ||
                  value === "source-count" ||
                  value === "view-count"
                    ? value
                    : "priority",
              })
            }
          />
          <Select
            aria-label={t`Sort direction`}
            value={params.direction ?? "asc"}
            data={[
              { value: "asc", label: t`Ascending` },
              { value: "desc", label: t`Descending` },
            ]}
            onChange={(value) =>
              update({ direction: value === "desc" ? "desc" : "asc" })
            }
          />
        </>
      )}
    </Flex>
  );
}
