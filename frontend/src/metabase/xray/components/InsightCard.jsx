import React, { Component } from "react";
import { formatTimeWithUnit } from "metabase/lib/formatting";
import Icon from "metabase/components/Icon";
import { Link } from "react-router";
import Question from "metabase-lib/lib/Question";
import { TermWithDefinition } from "metabase/components/TermWithDefinition";
import { t, jt } from "c-3po";

const InsightText = ({ children }) => (
  <p className="text-paragraph">{children}</p>
);

const Feedback = ({ insightType }) => (
  <div className="flex align-center px1">
    {t`Was this helpful?`}
    <div className="ml-auto text-bold">
      <a
        className="text-brand-hover"
        data-metabase-event={`InsightFeedback;${insightType};Yes`}
      >
        {t`Yes`}
      </a>
      <a
        className="text-brand-hover ml1"
        data-metabase-event={`InsightFeedback;${insightType};No`}
      >
        {t`No`}
      </a>
    </div>
  </div>
);

export class NormalRangeInsight extends Component {
  static insightType = "normal-range";
  static title = t`Normal range of values`;
  static icon = "insight";

  render() {
    const { lower, upper, features: { model } } = this.props;
    return (
      <InsightText>
        {jt`Most of the values for ${model.display_name ||
          model.name} are between ${<b>{lower}</b>} and ${<b>{upper}</b>}.`}
      </InsightText>
    );
  }
}

export class NilsInsight extends Component {
  static insightType = "nils";
  static title = t`Missing data`;
  static icon = "warning";

  render() {
    const { quality, filter, features: { table } } = this.props;

    const viewAllRowsUrl =
      table &&
      Question.create()
        .query()
        // imitate the required hydrated metadata format
        .setTable({ ...table, database: { id: table.db_id } })
        .addFilter(filter)
        .question()
        .getUrl();

    // construct the question with filter
    return (
      <InsightText>
        {t`You have ${quality} missing (null) values in your data`}.
        <span> </span>
        {table && (
          <span>
            <Link to={viewAllRowsUrl}>View all rows</Link> with missing value.
          </span>
        )}
      </InsightText>
    );
  }
}

export class ZerosInsight extends Component {
  static insightType = "zeros";
  static title = t`Zeros in your data`;
  static icon = "warning";

  render() {
    const { quality, filter, features: { table } } = this.props;

    const viewAllRowsUrl =
      table &&
      Question.create()
        .query()
        // imitate the required hydrated metadata format
        .setTable({ ...table, database: { id: table.db_id } })
        .addFilter(filter)
        .question()
        .getUrl();

    // construct the question with filter
    return (
      <InsightText>
        {t`You have ${quality} zeros in your data. They may be stand-ins for missing data, or might indicate some other abnormality.`}
        <span> </span>
        {table && (
          <span>
            <Link to={viewAllRowsUrl}>View all rows</Link> with zeros.
          </span>
        )}
      </InsightText>
    );
  }
}

const noisinessDefinition = t`Noisy data is highly variable, jumping all over the place with changes carrying relatively little information.`;
const noisinessLink = "https://en.wikipedia.org/wiki/Noisy_data";

export class NoisinessInsight extends Component {
  static insightType = "noisiness";
  static title = t`Noisy data`;
  static icon = "warning";

  render() {
    const { quality, "recommended-resolution": resolution } = this.props;

    return (
      <InsightText>
        Your data is {quality}
        <span> </span>
        <TermWithDefinition
          definition={noisinessDefinition}
          link={noisinessLink}
        >
          noisy
        </TermWithDefinition>.
        {resolution && ` You might consider looking at it by ${resolution}.`}
      </InsightText>
    );
  }
}

const autocorrelationDefinition = t`A measure of how much changes in previous values predict future values.`;
const autocorrelationLink = "https://en.wikipedia.org/wiki/Autocorrelation";

export class AutocorrelationInsight extends Component {
  static insightType = "autocorrelation";
  static title = t`Autocorrelation`;
  static icon = "insight";

  render() {
    const { quality, lag } = this.props;

    return (
      <InsightText>
        Your data has a {quality}{" "}
        <TermWithDefinition
          definition={autocorrelationDefinition}
          link={autocorrelationLink}
        >
          autocorrelation
        </TermWithDefinition>{" "}
        at lag {lag}.
      </InsightText>
    );
  }
}

const variationTrendDefinition = t`How variance in your data is changing over time.`;
const varianceLink = "https://en.wikipedia.org/wiki/Variance";

export class VariationTrendInsight extends Component {
  static insightType = "variation-trend";
  static title = t`Trending variation`;
  static icon = "insight";

  render() {
    const { mode } = this.props;
    const MODE_ADVERB_STRINGS = {
      increasing: t`increasingly`,
      decreasing: t`decreasingly`,
    };

    return (
      <InsightText>
        {t`It looks like this data has grown ${MODE_ADVERB_STRINGS[mode]}`}{" "}
        <TermWithDefinition
          definition={variationTrendDefinition}
          link={varianceLink}
        >
          {t`varied`}
        </TermWithDefinition>{" "}
        {t`over time.`}
      </InsightText>
    );
  }
}

export class SeasonalityInsight extends Component {
  static insightType = "seasonality";
  static title = t`Seasonality`;
  static icon = "insight";

  render() {
    const { quality } = this.props;

    return (
      <InsightText>
        {jt`Your data has a ${quality} seasonal component.`}
      </InsightText>
    );
  }
}

const multimodalDefinition = t`Data distribution with multiple peaks (modes).`;
const multimodalLink = "https://en.wikipedia.org/wiki/Multimodal_distribution";

export class MultimodalInsight extends Component {
  static insightType = "multimodal";
  static title = t`Multimodal`;
  static icon = "warning";

  render() {
    return (
      <InsightText>
        Your data looks to be{" "}
        <TermWithDefinition
          definition={multimodalDefinition}
          link={multimodalLink}
        >
          multimodal
        </TermWithDefinition>. This is often the case when different segments of
        data are mixed together.
      </InsightText>
    );
  }
}

export class OutliersInsight extends Component {
  static insightType = "outliers";
  static title = t`Outliers`;
  static icon = "warning";

  render() {
    const { filter, features: { table } } = this.props;

    const viewAllRowsUrl =
      table &&
      Question.create()
        .query()
        // imitate the required hydrated metadata format
        .setTable({ ...table, database: { id: table.db_id } })
        .addFilter(filter)
        .question()
        .getUrl();

    // construct the question with filter
    return (
      <InsightText>
        You have some outliers.
        <span> </span>
        {table && (
          <span>
            <Link to={viewAllRowsUrl}>View all rows</Link> with outliers.
          </span>
        )}
      </InsightText>
    );
  }
}

export class StructuralBreaksInsight extends Component {
  static insightType = "structural-breaks";
  static title = t`Structural breaks`;
  static icon = "insight";

  render() {
    const { breaks, features: { resolution } } = this.props;

    const breakPoints = breaks.map((point, idx) => {
      point = formatTimeWithUnit(point, resolution);

      if (idx == breaks.length - 1 && breaks.length > 1) {
        return <span>, and {point}</span>;
      } else {
        return (
          <span>
            {idx > 0 && <span>, </span>}
            {point}
          </span>
        );
      }
    });

    return (
      <InsightText>
        It looks like your data has
        {breaks.length > 1 && <span> structural breaks </span>}
        {breaks.length == 1 && <span> a structural break </span>}
        at {breakPoints}.
      </InsightText>
    );
  }
}

const stationaryDefinition = t`The mean does not change over time.`;
const stationaryLink = "https://en.wikipedia.org/wiki/Stationary_process";

export class StationaryInsight extends Component {
  static insightType = "stationary";
  static title = t`Stationary data`;
  static icon = "insight";

  render() {
    return (
      <InsightText>
        Your data looks to be{" "}
        <TermWithDefinition
          definition={stationaryDefinition}
          link={stationaryLink}
        >
          stationary
        </TermWithDefinition>.
      </InsightText>
    );
  }
}

export class TrendInsight extends Component {
  static insightType = "trend";
  static title = t`Trend`;
  static icon = "insight";

  render() {
    const { mode, shape } = this.props;

    return (
      <InsightText>{jt`Your data seems to be ${mode} ${shape}.`}</InsightText>
    );
  }
}

const INSIGHT_COMPONENTS = [
  // any field
  NilsInsight,
  // numeric fields
  NormalRangeInsight,
  ZerosInsight,
  MultimodalInsight,
  OutliersInsight,
  // timeseries
  NoisinessInsight,
  VariationTrendInsight,
  AutocorrelationInsight,
  SeasonalityInsight,
  StructuralBreaksInsight,
  StationaryInsight,
  TrendInsight,
];

export const InsightCard = ({ type, props, features }) => {
  const Insight = INSIGHT_COMPONENTS.find(
    component => component.insightType === type,
  );

  return (
    <div>
      <div
        className="bg-white bordered rounded shadowed p3"
        style={{ height: 180 }}
      >
        <header className="flex align-center">
          <Icon
            name={Insight.icon}
            size={24}
            className="mr1"
            style={{ color: "#93a1ab" }}
          />
          <span className="text-bold text-uppercase">{Insight.title}</span>
        </header>
        <div style={{ lineHeight: "1.4em" }}>
          <Insight {...props} features={features} />
        </div>
      </div>
      <div className="mt1">
        <Feedback insightType={type} />
      </div>
    </div>
  );
};
