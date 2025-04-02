import cx from "classnames";
import { Link } from "react-router";

import CS from "metabase/css/core/index.css";
import { Group, Icon } from "metabase/ui";
import type { Segment } from "metabase-types/api";

import SegmentActionSelect from "./SegmentActionSelect";

interface Props {
  segment: Segment;
  onRetire: () => void;
}

export const SegmentItem = ({ segment, onRetire }: Props) => {
  return (
    <tr className={cx(CS.mt1, CS.mb3)}>
      <td className={cx(CS.px1, CS.py1, CS.textWrap)}>
        <Link to={`/admin/datamodel/segment/${segment.id}`}>
          <Group align="center" display="inline-flex">
            <Icon name="segment" className={cx(CS.mr1, CS.textMedium)} />
            <span className={cx(CS.textDark, CS.textBold)}>{segment.name}</span>
          </Group>
        </Link>
      </td>
      <td className={cx(CS.px1, CS.py1, CS.textWrap)}>
        {segment.definition_description}
      </td>
      <td className={cx(CS.px1, CS.py1, CS.textCentered)}>
        <SegmentActionSelect object={segment} onRetire={onRetire} />
      </td>
    </tr>
  );
};
