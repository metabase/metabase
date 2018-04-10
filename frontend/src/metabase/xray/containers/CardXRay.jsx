import React, { Component } from "react";
import cxs from "cxs";
import { connect } from "react-redux";
import { t } from "c-3po";
import { saturated } from "metabase/lib/colors";

import { fetchCardXray, initialize } from "metabase/xray/xray";
import {
  getLoadingStatus,
  getError,
  getXray,
  getIsAlreadyFetched,
} from "metabase/xray/selectors";

import { xrayLoadingMessages } from "metabase/xray/utils";

import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Visualization from "metabase/visualizations/components/Visualization";

import { XRayPageWrapper, Heading } from "metabase/xray/components/XRayLayout";
import Periodicity from "metabase/xray/components/Periodicity";
import LoadingAnimation from "metabase/xray/components/LoadingAnimation";
import { Insights } from "metabase/xray/components/Insights";

const mapStateToProps = state => ({
  xray: getXray(state),
  isLoading: getLoadingStatus(state),
  isAlreadyFetched: getIsAlreadyFetched(state),
  error: getError(state),
});

const mapDispatchToProps = {
  initialize,
  fetchCardXray,
};

type Props = {
  initialize: () => void,
  initialize: () => {},
  fetchCardXray: () => void,
  isLoading: boolean,
  xray: {},
};

const GrowthRateDisplay = ({ period }) => (
  <div className="Grid-cell">
    <div className="p4 border-right">
      <h4 className="flex align-center">
        {period.label}
        {period.description && (
          <Tooltip tooltip={period.description}>
            <Icon name="infooutlined" style={{ marginLeft: 8 }} size={14} />
          </Tooltip>
        )}
      </h4>
      <h1
        className={cxs({
          color: period.value > 0 ? saturated.green : saturated.red,
        })}
      >
        {period.value && (period.value * 100).toFixed(2)}%
      </h1>
    </div>
  </div>
);

class CardXRay extends Component {
  props: Props;

  componentWillMount() {
    const { cardId, cost } = this.props.params;
    this.props.initialize();
    this.props.fetchCardXray(cardId, cost);
  }

  componentWillUnmount() {
    // HACK Atte Keinänen 9/20/17: We need this for now because the structure of `state.xray.xray` isn't same
    // for all xray types and if switching to different kind of xray (= rendering different React container)
    // without resetting the state fails because `state.xray.xray` subproperty lookups fail
    this.props.initialize();
  }

  render() {
    const { xray, isLoading, isAlreadyFetched, error } = this.props;

    return (
      <LoadingAndErrorWrapper
        loading={isLoading || !isAlreadyFetched}
        error={error}
        noBackground
        loadingMessages={xrayLoadingMessages}
        loadingScenes={[<LoadingAnimation />]}
      >
        {() => (
          <XRayPageWrapper>
            <div className="mt4 mb2">
              <h1 className="my3">{xray.features.model.name} X-ray</h1>
            </div>
            {xray.features["insights"] && (
              <div className="mt4">
                <Heading heading="Takeaways" />
                <Insights features={xray.features} />
              </div>
            )}
            <Heading heading="Growth rate" />
            <div className="bg-white bordered rounded shadowed">
              <div className="Grid Grid--1of4 border-bottom">
                {xray.features.DoD.value && (
                  <GrowthRateDisplay period={xray.features.DoD} />
                )}
                {xray.features.WoW.value && (
                  <GrowthRateDisplay period={xray.features.WoW} />
                )}
                {xray.features.MoM.value && (
                  <GrowthRateDisplay period={xray.features.MoM} />
                )}
                {xray.features.YoY.value && (
                  <GrowthRateDisplay period={xray.features.YoY} />
                )}
              </div>
              <div className="full">
                <div className="py1 px2" style={{ height: 320 }}>
                  <Visualization
                    rawSeries={[
                      {
                        card: xray.features.model,
                        data: xray.features.series,
                      },
                      {
                        card: {
                          display: "line",
                          name: t`Growth Trend`,
                          visualization_settings: {},
                        },
                        data: xray.features["linear-regression"].value,
                      },
                    ]}
                  />
                </div>
              </div>
            </div>

            <Heading heading={xray.features["growth-series"].label} />
            <div className="full">
              <div
                className="bg-white bordered rounded shadowed"
                style={{ height: 220 }}
              >
                <Visualization
                  rawSeries={[
                    {
                      card: {
                        display: "line",
                        name: t`Trend`,
                        visualization_settings: {},
                      },
                      data: {
                        ...xray.features["growth-series"].value,
                        // multiple row value by 100 to display as a %
                        rows: xray.features["growth-series"].value.rows.map(
                          row => [row[0], row[1] * 100],
                        ),
                      },
                    },
                  ]}
                />
              </div>
            </div>

            {xray.constituents[0] && (
              <Periodicity xray={Object.values(xray.constituents)[0]} />
            )}

            <Heading heading={xray.features["seasonal-decomposition"].label} />
            <div className="full">
              <div
                className="bg-white bordered rounded shadowed"
                style={{ height: 220 }}
              >
                <Visualization
                  rawSeries={[
                    {
                      card: {
                        display: "line",
                        name: t`Trend`,
                        visualization_settings: {},
                      },
                      data: xray.features["seasonal-decomposition"].value.trend,
                    },
                    {
                      card: {
                        display: "line",
                        name: t`Seasonal`,
                        visualization_settings: {},
                      },
                      data:
                        xray.features["seasonal-decomposition"].value.seasonal,
                    },
                    {
                      card: {
                        display: "line",
                        name: t`Residual`,
                        visualization_settings: {},
                      },
                      data:
                        xray.features["seasonal-decomposition"].value.residual,
                    },
                  ]}
                />
              </div>
            </div>
          </XRayPageWrapper>
        )}
      </LoadingAndErrorWrapper>
    );
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(CardXRay);
