import { push } from "react-router-redux";
import { t } from "ttag";

import { AdminContentTable } from "metabase/common/components/AdminContentTable";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Card } from "metabase/ui";
import type { Transform } from "metabase-types/api";

import S from "./TransformTable.module.css";

type TransformTableProps = {
  transforms: Transform[];
};

export function TransformTable({ transforms }: TransformTableProps) {
  const dispatch = useDispatch();

  const handleRowClick = (transform: Transform) => {
    dispatch(push(Urls.transform(transform.id)));
  };

  return (
    <Card p={0} shadow="none" withBorder>
      <AdminContentTable columnTitles={[t`Transform`, t`Target`]}>
        {transforms.map((transform) => (
          <tr
            key={transform.id}
            className={S.row}
            onClick={() => handleRowClick(transform)}
          >
            <td className={S.wrap}>{transform.name}</td>
            <td className={S.wrap}>{transform.target.name}</td>
          </tr>
        ))}
      </AdminContentTable>
    </Card>
  );
}
