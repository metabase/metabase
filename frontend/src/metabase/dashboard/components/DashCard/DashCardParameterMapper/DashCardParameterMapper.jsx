/* eslint-disable react/prop-types */
import cx from "classnames";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Flex } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";

import { DashCardCardParameterMapperConnected } from "./DashCardCardParameterMapper";
import S from "./DashCardParameterMapper.module.css";

export const DashCardParameterMapper = ({
  dashcard,
  isMobile,
  compact = false,
}) => (
  <div
    className={cx(
      CS.relative,
      CS.flexFull,
      CS.flex,
      CS.flexColumn,
      CS.layoutCentered,
    )}
  >
    {dashcard.series && dashcard.series.length > 0 && (
      <div
        className={cx(CS.mx4, CS.my1, CS.p1, CS.rounded, CS.textMedium)}
        style={{
          backgroundColor: color("background-secondary"),
          marginTop: -10,
        }}
      >
        {t`Make sure to make a selection for each series, or the filter won't work on this card.`}
      </div>
    )}
    <Flex
      justify="space-around"
      maw="100%"
      m={compact ? undefined : "0 2rem"}
      gap="sm"
      className={S.MapperSettingsContainer}
      data-testid="parameter-mapper-container"
    >
      {[dashcard.card].concat(dashcard.series || []).map((card) => (
        <DashCardCardParameterMapperConnected
          key={`${dashcard.id},${card.id}`}
          dashcard={dashcard}
          card={card}
          isMobile={isMobile}
          compact={compact}
        />
      ))}
    </Flex>
  </div>
);
