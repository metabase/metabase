import React from "react";
import { t, jt } from "c-3po";
import _ from "underscore";
import cx from "classnames";

import colors, { alpha } from "metabase/lib/colors";

import Icon from "metabase/components/Icon";
import Button from "metabase/components/Button";

import { DatabaseSchemaAndTableDataSelector } from "metabase/query_builder/components/DataSelector";

import Visualization from "metabase/visualizations/components/Visualization.jsx";

const SECTIONS = {
  filter: {
    name: t`Filter`,
    icon: "funnel",
    color: colors["accent2"],
  },
  summarize: {
    name: t`Summarize`,
    icon: "sum",
    color: colors["accent1"],
  },
  preview: {
    name: t`Preview`,
    icon: "eye",
    color: colors["text-medium"],
  },
};

export default class QuestionDataWorksheet extends React.Component {
  state = {
    previewLimit: 10,
    showSection: null,
  };

  preview = () => {
    const { runQuestionQuery } = this.props;
    runQuestionQuery({
      overrideWithCard: this.getPreviewCard(),
      shouldUpdateUrl: false,
    });
  };

  getPreviewCard() {
    const { query } = this.props;
    const { previewLimit } = this.state;
    return query
      .updateLimit(previewLimit)
      .question()
      .card();
  }

  isPreviewCurrent() {
    return _.isEqual(this.props.lastRunCard, this.getPreviewCard());
  }

  setPreviewLimit = previewLimit => {
    this.setState({ previewLimit }, this.preview);
  };

  filter = () => {
    this.setState({ showSection: "filter" });
  };

  summarize = () => {
    this.setState({ showSection: "summarize" });
  };

  render() {
    const { isRunnable, query } = this.props;
    const { showSection } = this.state;
    console.log(this.props);

    const showFilterSection =
      query.filters().length > 0 || showSection === "filter";
    const showSummarizeSection =
      query.aggregations().length > 0 ||
      query.breakouts().length > 0 ||
      showSection === "summarize";

    return (
      <div>
        <DataSection {...this.props} />
        {showFilterSection && <FiltersSection {...this.props} />}
        {showSummarizeSection && <SummarizeSection {...this.props} />}
        {isRunnable && (
          <PreviewSection
            {...this.props}
            preview={this.preview}
            previewLimit={this.state.previewLimit}
            setPreviewLimit={this.setPreviewLimit}
            isPreviewCurrent={this.isPreviewCurrent()}
          >
            {!showFilterSection && (
              <SectionButton
                {...SECTIONS.filter}
                className="mr1"
                onClick={this.filter}
              />
            )}
            {!showSummarizeSection && (
              <SectionButton
                {...SECTIONS.summarize}
                className="mr1"
                onClick={this.summarize}
              />
            )}
          </PreviewSection>
        )}
        {isRunnable && <ViewItSection {...this.props} />}
      </div>
    );
  }
}

const Section = ({ icon, name, color, header, children }) => (
  <div className="wrapper border-row-divider py4">
    {(icon || name || header) && (
      <div className={cx("flex align-center", { mb2: !!children })}>
        {icon && <Icon name={icon} style={{ color }} className="mr1" />}
        {name && (
          <span className="h3" style={{ color }}>
            {name}
          </span>
        )}
        {header}
      </div>
    )}
    {children}
  </div>
);

const DataSection = ({ databases, query, setDatabaseFn, setSourceTableFn }) => {
  const databaseId = query.databaseId();
  const tableId = query.tableId();
  const isInitiallyOpen = tableId == null || databaseId == null;
  return (
    <Section
      name={t`Data`}
      icon="table2"
      color={colors.brand}
      header={
        <DatabaseSchemaAndTableDataSelector
          databases={databases}
          selectedDatabaseId={databaseId}
          selectedTableId={tableId}
          setDatabaseFn={setDatabaseFn}
          setSourceTableFn={setSourceTableFn}
          isInitiallyOpen={isInitiallyOpen}
          triggerClasses="bordered rounded border-med p1 inline-block ml4"
        />
      }
    />
  );
};

const ClauseContainer = ({ className, style = {}, children, color }) => (
  <div
    className={cx(className, "rounded text-medium p2")}
    style={{ backgroundColor: alpha(color, 0.25), ...style }}
  >
    {children}
  </div>
);

const Clause = ({ children, style = {}, color }) => (
  <div
    className="rounded text-white p2"
    style={{ backgroundColor: color, ...style }}
  >
    {children}
  </div>
);

const FiltersSection = ({ query }) => {
  const filters = query.filters();
  const color = SECTIONS.filter.color;
  return (
    <Section {...SECTIONS.filter}>
      <ClauseContainer color={color}>
        {filters.length > 0 ? (
          filters.map(filter => (
            <Clause color={color}>{JSON.stringify(filter)}</Clause>
          ))
        ) : (
          <div className="text-centered">{jt`Drag a column here to ${(
            <strong>{t`filter`}</strong>
          )} with it`}</div>
        )}
      </ClauseContainer>
    </Section>
  );
};

const SummarizeSection = ({ query }) => {
  const aggregations = query.aggregations();
  const breakouts = query.breakouts();
  const color = SECTIONS.summarize.color;
  return (
    <Section {...SECTIONS.summarize}>
      <div className="Grid Grid--full md-Grid--1of2">
        <div className="Grid-cell pr2">
          <SectionSubHeading>{t`Metrics`}</SectionSubHeading>
          <ClauseContainer color={color}>
            {aggregations.length > 0 ? (
              aggregations.map(aggregation => (
                <Clause color={color}>{JSON.stringify(aggregation)}</Clause>
              ))
            ) : (
              <div className="text-centered">{jt`Drag a column here to ${(
                <strong>{t`summarize`}</strong>
              )} it`}</div>
            )}
          </ClauseContainer>
        </div>
        <div className="Grid-cell pl2">
          <SectionSubHeading>{t`Dimensions`}</SectionSubHeading>
          <ClauseContainer color={color}>
            {breakouts.length > 0 ? (
              breakouts.map(breakout => (
                <Clause color={color}>{JSON.stringify(breakout)}</Clause>
              ))
            ) : (
              <div className="text-centered">{jt`Drag a column here to ${(
                <strong>{t`group`}</strong>
              )} it`}</div>
            )}
          </ClauseContainer>
        </div>
      </div>
    </Section>
  );
};

const SectionSubHeading = ({ children }) => (
  <div className="text-uppercase text-small mb1">{children}</div>
);

const PreviewSection = ({
  preview,
  previewLimit,
  setPreviewLimit,
  isPreviewCurrent,
  children,
  ...props
}) => {
  return (
    <Section
      {...SECTIONS.preview}
      header={
        <div className="flex-full flex align-center justify-end">
          <PreviewLimitSelect
            previewLimit={previewLimit}
            setPreviewLimit={setPreviewLimit}
          />
          <PreviewRefreshButton onClick={preview} className="ml1" />
        </div>
      }
    >
      <div
        style={{ height: 350, width: "100%" }}
        className="bordered rounded bg-white relative"
      >
        {props.rawSeries && isPreviewCurrent ? (
          <Visualization {...props} />
        ) : !props.isRunning ? (
          <div
            onClick={preview}
            className="cursor-pointer spread flex layout-centered"
          >
            <span className="text-medium h3">{t`Show preview`}</span>
          </div>
        ) : null}
      </div>
      {children && <div className="mt2">{children}</div>}
    </Section>
  );
};

const RoundButtonWithIcon = ({
  icon,
  className,
  style = {},
  children,
  size = 36,
  ...props
}) => (
  <span
    className={cx("circular cursor-pointer inline-block", className)}
    style={{ width: children ? undefined : size, height: size, ...style }}
    {...props}
  >
    <span className="flex layout-centered full-height">
      {icon && <Icon name={icon} className={cx({ ml1: children })} />}
      {children && <span className="mx1">{children}</span>}
    </span>
  </span>
);

const PreviewRefreshButton = ({ className, ...props }) => (
  <RoundButtonWithIcon
    icon="refresh"
    className={cx(className, "bg-medium text-brand")}
    {...props}
  />
);

const SectionButton = ({
  name,
  icon,
  color,
  className,
  showTitle = true,
  style = {},
  ...props
}) => (
  <RoundButtonWithIcon
    icon={icon}
    className={cx(className, "bordered bg-white")}
    style={{ color, ...style }}
    {...props}
  >
    {showTitle ? name : null}
  </RoundButtonWithIcon>
);

const PreviewLimitSelect = ({ previewLimit, setPreviewLimit }) => (
  <select
    value={previewLimit}
    onChange={e => setPreviewLimit(parseInt(e.target.value))}
  >
    {[10, 100, 1000].map(limit => (
      <option key={limit} value={limit}>
        {limit} rows
      </option>
    ))}
  </select>
);

const ViewItSection = ({ setMode }) => {
  return (
    <Section>
      <div className="flex justify-end">
        <Button primary onClick={() => setMode("present")}>
          View it
        </Button>
      </div>
    </Section>
  );
};
