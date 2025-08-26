import { push } from "react-router-redux";
import { t } from "ttag";

import { AdminContentTable } from "metabase/common/components/AdminContentTable";
import { useDispatch } from "metabase/lib/redux";
import { Card, Center, Loader } from "metabase/ui";
import { useListTransformDependenciesQuery } from "metabase-enterprise/api";
import type { Transform } from "metabase-types/api";

import { TitleSection } from "../../../components/TitleSection";
import { getTransformUrl } from "../../../urls";

import S from "./DependenciesSection.module.css";

// TODO: remove this once the api has real data
const MOCK = [
  { id: 1, name: "Join Accounts and companies", target: { name: "foo" } },
  { id: 2, name: "Maz's custom transform", target: { name: "bar" } },
];

export function DependenciesSection({ transform }: { transform: Transform }) {
  const { data: dependencies = MOCK, isLoading } =
    useListTransformDependenciesQuery(transform.id);
  const dispatch = useDispatch();

  if (!isLoading && dependencies?.length === 0) {
    return null;
  }

  const handleRowClick = (transform: Transform) => {
    dispatch(push(getTransformUrl(transform.id)));
  };

  return (
    <TitleSection
      label={t`Dependencies`}
      description={t`This transform depends on the output of the transforms below, so they need to be run first.`}
    >
      <Card p={0} shadow="none" withBorder>
        {isLoading ? (
          <Center>
            <Loader m="xl" />
          </Center>
        ) : (
          <AdminContentTable columnTitles={[t`Transform`, t`Target`]}>
            {dependencies?.map((transform) => (
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
