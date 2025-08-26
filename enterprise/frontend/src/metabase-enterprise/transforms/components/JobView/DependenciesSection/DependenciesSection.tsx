import { push } from "react-router-redux";
import { t } from "ttag";

import { AdminContentTable } from "metabase/common/components/AdminContentTable";
import { useDispatch } from "metabase/lib/redux";
import { Card, Center, Loader } from "metabase/ui";
import { useListTransformJobTransformsQuery } from "metabase-enterprise/api";
import type { Transform, TransformJob } from "metabase-types/api";

import { TitleSection } from "../../../components/TitleSection";
import { getTransformUrl } from "../../../urls";

import S from "./DependenciesSection.module.css";

// TODO: remove this once the api has real data
const MOCK: Transform[] = [
  { id: 1, name: "Join Accounts and companies", target: { name: "foo" } },
  { id: 2, name: "Maz's custom transform", target: { name: "bar" } },
];

export function DependenciesSection({ job }: { job: TransformJob }) {
  const { data: transforms = MOCK, isLoading } =
    useListTransformJobTransformsQuery(job.id);
  const dispatch = useDispatch();

  if (!isLoading && transforms?.length === 0) {
    return null;
  }

  const handleRowClick = (transform: Transform) => {
    dispatch(push(getTransformUrl(transform.id)));
  };

  return (
    <TitleSection label={t`Transforms will be run in this order`}>
      <Card p={0} shadow="none" withBorder>
        {isLoading ? (
          <Center>
            <Loader m="xl" />
          </Center>
        ) : (
          <AdminContentTable columnTitles={[t`Transform`, t`Target`]}>
            {transforms?.map((transform) => (
              <tr
                key={transform.id}
                className={S.row}
                onClick={() => handleRowClick(transform)}
              >
                <th>{transform.name}</th>
                <td>{transform.target.name}</td>
              </tr>
            ))}
          </AdminContentTable>
        )}
      </Card>
    </TitleSection>
  );
}
