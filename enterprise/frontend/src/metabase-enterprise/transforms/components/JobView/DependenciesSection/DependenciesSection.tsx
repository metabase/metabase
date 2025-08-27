import { push } from "react-router-redux";
import { t } from "ttag";

import { AdminContentTable } from "metabase/common/components/AdminContentTable";
import EmptyState from "metabase/common/components/EmptyState";
import { useDispatch } from "metabase/lib/redux";
import { Box, Card, Center, Loader } from "metabase/ui";
import { useListTransformJobTransformsQuery } from "metabase-enterprise/api";
import type { Transform, TransformJob } from "metabase-types/api";

import { TitleSection } from "../../../components/TitleSection";
import { getTransformUrl } from "../../../urls";

import S from "./DependenciesSection.module.css";

export function DependenciesSection({ job }: { job: TransformJob }) {
  const { data: transforms, isLoading } = useListTransformJobTransformsQuery(
    job.id,
  );
  const dispatch = useDispatch();

  const handleRowClick = (transform: Transform) => {
    dispatch(push(getTransformUrl(transform.id)));
  };

  return (
    <TitleSection
      label={t`Transforms`}
      description={t`Transforms will be run in this order.`}
    >
      <Card p={0} shadow="none" withBorder>
        {isLoading ? (
          <Center>
            <Loader m="xl" />
          </Center>
        ) : (
          <AdminContentTable columnTitles={[t`Transform`, t`Target`]}>
            {!transforms || transforms?.length === 0 ? (
              <tr>
                <td colSpan={2}>
                  <Box p="md">
                    <EmptyState
                      message={t`There are no transforms for this job.`}
                    />
                  </Box>
                </td>
              </tr>
            ) : (
              transforms?.map((transform) => (
                <tr
                  key={transform.id}
                  className={S.row}
                  onClick={() => handleRowClick(transform)}
                >
                  <td>{transform.name}</td>
                  <td>{transform.target.name}</td>
                </tr>
              ))
            )}
          </AdminContentTable>
        )}
      </Card>
    </TitleSection>
  );
}
