/* eslint-disable react/display-name */

import React, { Component } from "react";
import { t } from "c-3po";
import Tutorial, { qs, qsWithContent } from "./Tutorial.jsx";

import RetinaImage from "react-retina-image";

const QUERY_BUILDER_STEPS = [
  {
    getPortalTarget: () => qs(".GuiBuilder"),
    getModal: props => (
      <div className="text-centered">
        <RetinaImage
          className="mb2"
          forceOriginalDimensions={false}
          src="app/assets/img/qb_tutorial/question_builder.png"
          width={186}
        />
        <h3>{t`Welcome to the Query Builder!`}</h3>
        <p
        >{t`The Query Builder lets you assemble questions (or "queries") to ask about your data.`}</p>
        <a
          className="Button Button--primary"
          onClick={props.onNext}
        >{t`Tell me more`}</a>
      </div>
    ),
  },
  {
    getPortalTarget: () => qs(".GuiBuilder-data"),
    getModalTarget: () => qs(".GuiBuilder-data"),
    getModal: props => (
      <div className="text-centered">
        <RetinaImage
          id="QB-TutorialTableImg"
          className="mb2"
          forceOriginalDimensions={false}
          src="app/assets/img/qb_tutorial/table.png"
          width={157}
        />
        <h3
        >{t`Start by picking the table with the data that you have a question about.`}</h3>
        <p
        >{t`Go ahead and select the "Orders" table from the dropdown menu.`}</p>
      </div>
    ),
    shouldAllowEvent: e => qs(".GuiBuilder-data a").contains(e.target),
  },
  {
    getPortalTarget: () => qs(".GuiBuilder-data"),
    getPageFlagTarget: () =>
      qsWithContent(".List-section-header", "Sample Dataset"),
    shouldAllowEvent: e =>
      qsWithContent(".List-section-header", "Sample Dataset").contains(
        e.target,
      ),
    optional: true,
  },
  {
    getPortalTarget: () => qs(".GuiBuilder-data"),
    getPageFlagTarget: () => qsWithContent(".List-item", "Orders"),
    shouldAllowEvent: e =>
      qsWithContent(".List-item > a", "Orders").contains(e.target),
  },
  {
    getPortalTarget: () => qs(".GuiBuilder-filtered-by"),
    getModalTarget: () => qs(".GuiBuilder-filtered-by"),
    getModal: props => (
      <div className="text-centered">
        <RetinaImage
          className="mb2"
          forceOriginalDimensions={false}
          id="QB-TutorialFunnelImg"
          src="app/assets/img/qb_tutorial/funnel.png"
          width={135}
        />
        <h3>{t`Filter your data to get just what you want.`}</h3>
        <p>{t`Click the plus button and select the "Created At" field.`}</p>
      </div>
    ),
    shouldAllowEvent: e => qs(".GuiBuilder-filtered-by a").contains(e.target),
  },
  {
    getPortalTarget: () => qs(".GuiBuilder-filtered-by"),
    getPageFlagTarget: () => qsWithContent(".List-item", "Created At"),
    shouldAllowEvent: e =>
      qsWithContent(".List-item > a", "Created At").contains(e.target),
  },
  {
    getPortalTarget: () => qs(".GuiBuilder-filtered-by"),
    getPageFlagText: () =>
      t`Here we can pick how many days we want to see data for, try 10`,
    getPageFlagTarget: () => qs('[data-ui-tag="relative-date-input"]'),
    shouldAllowEvent: e =>
      qs('[data-ui-tag="relative-date-input"]').contains(e.target),
  },
  {
    getPortalTarget: () => qs(".GuiBuilder-filtered-by"),
    getPageFlagTarget: () => qs('[data-ui-tag="add-filter"]'),
    shouldAllowEvent: e => qs('[data-ui-tag="add-filter"]').contains(e.target),
  },
  {
    getPortalTarget: () => qs(".Query-section-aggregation"),
    getModalTarget: () => qs(".Query-section-aggregation"),
    getModal: props => (
      <div className="text-centered">
        <RetinaImage
          className="mb2"
          forceOriginalDimensions={false}
          id="QB-TutorialCalculatorImg"
          src="app/assets/img/qb_tutorial/calculator.png"
          width={115}
        />
        <h3
        >{t`Here's where you can choose to add or average your data, count the number of rows in the table, or just view the raw data.`}</h3>
        <p
        >{t`Try it: click on <strong>Raw Data</strong> to change it to <strong>Count of rows</strong> so we can count how many orders there are in this table.`}</p>
      </div>
    ),
    shouldAllowEvent: e => qs(".View-section-aggregation").contains(e.target),
  },
  {
    getPortalTarget: () => qs(".Query-section-aggregation"),
    getPageFlagTarget: () => qsWithContent(".List-item", "Count of rows"),
    shouldAllowEvent: e =>
      qsWithContent(".List-item > a", "Count of rows").contains(e.target),
  },
  {
    getPortalTarget: () => qs(".Query-section-breakout"),
    getModalTarget: () => qs(".Query-section-breakout"),
    getModal: props => (
      <div className="text-centered">
        <RetinaImage
          className="mb2"
          forceOriginalDimensions={false}
          id="QB-TutorialBananaImg"
          src="app/assets/img/qb_tutorial/banana.png"
          width={232}
        />
        <h3
        >{t`Add a grouping to break out your results by category, day, month, and more.`}</h3>
        <p
        >{t`Let's do it: click on <strong>Add a grouping</strong>, and choose <strong>Created At: by Week</strong>.`}</p>
      </div>
    ),
    shouldAllowEvent: e => qs(".Query-section-breakout").contains(e.target),
  },
  {
    getPortalTarget: () => qs(".Query-section-breakout"),
    getPageFlagTarget: () => qs(".FieldList-grouping-trigger"),
    getPageFlagText: () => t`Click on "by day" to change it to "Week."`,
    shouldAllowEvent: e => qs(".FieldList-grouping-trigger").contains(e.target),
  },
  {
    getPortalTarget: () => qs(".Query-section-breakout"),
    getPageFlagTarget: () => qsWithContent(".List-item", "Week"),
    shouldAllowEvent: e =>
      qsWithContent(".List-item > a", "Week").contains(e.target),
  },
  {
    getPortalTarget: () => qs(".RunButton"),
    getModalTarget: () => qs(".RunButton"),
    getModal: props => (
      <div className="text-centered">
        <RetinaImage
          className="mb2"
          forceOriginalDimensions={false}
          id="QB-TutorialRocketImg"
          src="app/assets/img/qb_tutorial/rocket.png"
          width={217}
        />
        <h3>{t`Run Your Query.`}</h3>
        <p
        >{t`You're doing so well! Click <strong>Run query</strong> to get your results!`}</p>
      </div>
    ),
    shouldAllowEvent: e => qs(".RunButton").contains(e.target),
  },
  {
    getPortalTarget: () => qs(".VisualizationSettings"),
    getModalTarget: () => qs(".VisualizationSettings"),
    getModal: props => (
      <div className="text-centered">
        <RetinaImage
          className="mb2"
          forceOriginalDimensions={false}
          id="QB-TutorialChartImg"
          src="app/assets/img/qb_tutorial/chart.png"
          width={160}
        />
        <h3>{t`You can view your results as a chart instead of a table.`}</h3>
        <p
        >{t`Everbody likes charts! Click the <strong>Visualization</strong> dropdown and select <strong>Line</strong>.`}</p>
      </div>
    ),
    shouldAllowEvent: e => qs(".VisualizationSettings a").contains(e.target),
  },
  {
    getPortalTarget: () => qs(".VisualizationSettings"),
    getPageFlagTarget: () => qsWithContent(".ChartType-popover li", "Line"),
    shouldAllowEvent: e =>
      qsWithContent(".ChartType-popover li", "Line").contains(e.target),
  },
  {
    getPortalTarget: () => true,
    getModal: props => (
      <div className="text-centered">
        <RetinaImage
          className="mb2"
          forceOriginalDimensions={false}
          id="QB-TutorialBoatImg"
          src="app/assets/img/qb_tutorial/boat.png"
          width={190}
        />
        <h3>{t`Well done!`}</h3>
        <p>
          {t`That's all! If you still have questions, check out our`}{" "}
          <a
            className="link"
            target="_blank"
            href="http://www.metabase.com/docs/latest/users-guide/start.html"
          >{t`User's Guide`}</a>. {t`Have fun exploring your data!`}
        </p>
        <a className="Button Button--primary" onClick={props.onNext}>
          {t`Thanks`}!
        </a>
      </div>
    ),
  },
  {
    getModalTarget: () => qsWithContent(".Header-buttonSection a", "Save"),
    getModal: props => (
      <div className="text-centered">
        <h3>{t`Save Your Questions`}!</h3>
        <p
        >{t`By the way, you can save your questions so you can refer to them later. Saved Questions can also be put into dashboards or Pulses.`}</p>
        <a
          className="Button Button--primary"
          onClick={props.onClose}
        >{t`Sounds good`}</a>
      </div>
    ),
  },
];

export default class QueryBuilderTutorial extends Component {
  render() {
    return <Tutorial steps={QUERY_BUILDER_STEPS} {...this.props} />;
  }
}
