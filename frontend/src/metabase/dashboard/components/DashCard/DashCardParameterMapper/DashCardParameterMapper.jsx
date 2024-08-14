/* eslint-disable react/prop-types */
import cx from "classnames";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { color } from "metabase/lib/colors";

import { DashCardCardParameterMapperConnected } from "./DashCardCardParameterMapper";
import { MapperSettingsContainer } from "./DashCardParameterMapper.styled";

export const DashCardParameterMapper = ({ dashcard, isMobile }) => (
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
          backgroundColor: color("bg-light"),
          marginTop: -10,
        }}
      >
        {t`Make sure to make a selection for each series, or the filter won't work on this card.`}
      </div>
    )}
    <MapperSettingsContainer data-testid="parameter-mapper-container">
      {[dashcard.card].concat(dashcard.series || []).map(card => (
        <DashCardCardParameterMapperConnected
          key={`${dashcard.id},${card.id}`}
          dashcard={dashcard}
          card={card}
          isMobile={isMobile}
        />
      ))}
    </MapperSettingsContainer>
  </div>
);
