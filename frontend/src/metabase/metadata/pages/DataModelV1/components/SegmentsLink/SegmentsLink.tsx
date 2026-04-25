import cx from "classnames";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { Flex, Icon } from "metabase/ui";
import { modelIconMap } from "metabase/utils/icon";

import S from "./SegmentsLink.module.css";

interface Props {
  active: boolean;
  to: string;
}

export const SegmentsLink = ({ active, to }: Props) => {
  return (
    <Flex
      className={cx(S.segmentsLink, { [S.active]: active })}
      component={Link}
      gap="sm"
      p="sm"
      to={to}
    >
      <Icon name={modelIconMap.segment} className={S.segmentsIcon} />

      {t`Segments`}
    </Flex>
  );
};
