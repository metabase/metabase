import React, { Component } from "react";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import { t } from "c-3po";
import cx from "classnames";
import Icon from "metabase/components/Icon.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import AccordianList from "metabase/components/AccordianList.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import { isQueryable } from "metabase/lib/table";
import { titleize, humanize } from "metabase/lib/formatting";

import { fetchTableMetadata } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";

import _ from "underscore";

// chooses a database
const DATABASE_STEP = "DATABASE";
// chooses a database and a schema inside that database
const DATABASE_SCHEMA_STEP = "DATABASE_SCHEMA";
// chooses a schema (given that a database has already been selected)
const SCHEMA_STEP = "SCHEMA";
// chooses a database and a schema and provides additional "Segments" option for jumping to SEGMENT_STEP
const SCHEMA_AND_SEGMENTS_STEP = "SCHEMA_AND_SEGMENTS";
// chooses a table (database has already been selected)
const TABLE_STEP = "TABLE";
// chooses a table field (table has already been selected)
const FIELD_STEP = "FIELD";
// shows either table or segment list depending on which one is selected
const SEGMENT_OR_TABLE_STEP = "SEGMENT_OR_TABLE_STEP";

export const SchemaTableAndSegmentDataSelector = props => (
  <DataSelector
    steps={[SCHEMA_AND_SEGMENTS_STEP, SEGMENT_OR_TABLE_STEP]}
    getTriggerElementContent={SchemaAndSegmentTriggerContent}
    {...props}
  />
);
export const SchemaAndSegmentTriggerContent = ({
  selectedTable,
  selectedSegment,
}) => {
  if (selectedTable) {
    return (
      <span className="text-grey no-decoration">
        {selectedTable.display_name || selectedTable.name}
      </span>
    );
  } else if (selectedSegment) {
    return (
      <span className="text-grey no-decoration">{selectedSegment.name}</span>
    );
  } else {
    return (
      <span className="text-medium no-decoration">{t`Pick a segment or table`}</span>
    );
  }
};

export const DatabaseDataSelector = props => (
  <DataSelector
    steps={[DATABASE_STEP]}
    getTriggerElementContent={DatabaseTriggerContent}
    {...props}
  />
);
export const DatabaseTriggerContent = ({ selectedDatabase }) =>
  selectedDatabase ? (
    <span className="text-grey no-decoration">{selectedDatabase.name}</span>
  ) : (
    <span className="text-medium no-decoration">{t`Select a database`}</span>
  );

export const SchemaTableAndFieldDataSelector = props => (
  <DataSelector
    steps={[SCHEMA_STEP, TABLE_STEP, FIELD_STEP]}
    getTriggerElementContent={FieldTriggerContent}
    triggerIconSize={12}
    renderAsSelect={true}
    {...props}
  />
);
export const FieldTriggerContent = ({ selectedDatabase, selectedField }) => {
  if (!selectedField || !selectedField.table) {
    return (
      <span className="flex-full text-medium no-decoration">{t`Select...`}</span>
    );
  } else {
    const hasMultipleSchemas =
      selectedDatabase &&
      _.uniq(selectedDatabase.tables, t => t.schema).length > 1;
    return (
      <div className="flex-full cursor-pointer">
        <div className="h6 text-bold text-uppercase text-light">
          {hasMultipleSchemas && selectedField.table.schema + " > "}
          {selectedField.table.display_name}
        </div>
        <div className="h4 text-bold text-default">
          {selectedField.display_name}
        </div>
      </div>
    );
  }
};

export const DatabaseSchemaAndTableDataSelector = props => (
  <DataSelector
    steps={[DATABASE_SCHEMA_STEP, TABLE_STEP]}
    getTriggerElementContent={TableTriggerContent}
    {...props}
  />
);
export const SchemaAndTableDataSelector = props => (
  <DataSelector
    steps={[SCHEMA_STEP, TABLE_STEP]}
    getTriggerElementContent={TableTriggerContent}
    {...props}
  />
);
export const TableTriggerContent = ({ selectedTable }) =>
  selectedTable ? (
    <span className="text-grey no-decoration">
      {selectedTable.display_name || selectedTable.name}
    </span>
  ) : (
    <span className="text-medium no-decoration">{t`Select a table`}</span>
  );

@connect(state => ({ metadata: getMetadata(state) }), { fetchTableMetadata })
export default class DataSelector extends Component {
  constructor(props) {
    super();

    this.state = {
      ...this.getStepsAndSelectedEntities(props),
      activeStep: null,
      isLoading: false,
    };
  }

  getStepsAndSelectedEntities = props => {
    let selectedSchema, selectedTable;
    let selectedDatabaseId = props.selectedDatabaseId;
    // augment databases with schemas
    const databases =
      props.databases &&
      props.databases.map(database => {
        let schemas = {};
        for (let table of database.tables.filter(isQueryable)) {
          let name = table.schema || "";
          schemas[name] = schemas[name] || {
            name: titleize(humanize(name)),
            database: database,
            tables: [],
          };
          schemas[name].tables.push(table);
          if (props.selectedTableId && table.id === props.selectedTableId) {
            selectedSchema = schemas[name];
            selectedDatabaseId = selectedSchema.database.id;
            selectedTable = table;
          }
        }
        schemas = Object.values(schemas);
        // Hide the schema name if there is only one schema
        if (schemas.length === 1) {
          schemas[0].name = "";
        }
        return {
          ...database,
          schemas: schemas.sort((a, b) => a.name.localeCompare(b.name)),
        };
      });

    const selectedDatabase = selectedDatabaseId
      ? databases.find(db => db.id === selectedDatabaseId)
      : null;
    const hasMultipleSchemas =
      selectedDatabase &&
      _.uniq(selectedDatabase.tables, t => t.schema).length > 1;

    // remove the schema step if a database is already selected and the database does not have more than one schema.
    let steps = [...props.steps];
    if (
      selectedDatabase &&
      !hasMultipleSchemas &&
      steps.includes(SCHEMA_STEP)
    ) {
      steps.splice(props.steps.indexOf(SCHEMA_STEP), 1);
      selectedSchema = selectedDatabase.schemas[0];
    }

    // if a db is selected but schema isn't, default to the first schema
    selectedSchema =
      selectedSchema || (selectedDatabase && selectedDatabase.schemas[0]);

    const selectedSegmentId = props.selectedSegmentId;
    const selectedSegment = selectedSegmentId
      ? props.segments.find(segment => segment.id === selectedSegmentId)
      : null;
    const selectedField = props.selectedFieldId
      ? props.metadata.fields[props.selectedFieldId]
      : null;

    return {
      databases,
      selectedDatabase,
      selectedSchema,
      selectedTable,
      selectedSegment,
      selectedField,
      steps,
    };
  };

  static propTypes = {
    selectedDatabaseId: PropTypes.number,
    selectedTableId: PropTypes.number,
    selectedFieldId: PropTypes.number,
    selectedSegmentId: PropTypes.number,
    databases: PropTypes.array.isRequired,
    segments: PropTypes.array,
    disabledTableIds: PropTypes.array,
    disabledSegmentIds: PropTypes.array,
    setDatabaseFn: PropTypes.func,
    setFieldFn: PropTypes.func,
    setSourceTableFn: PropTypes.func,
    setSourceSegmentFn: PropTypes.func,
    isInitiallyOpen: PropTypes.bool,
    renderAsSelect: PropTypes.bool,
  };

  static defaultProps = {
    isInitiallyOpen: false,
    renderAsSelect: false,
  };

  componentWillMount() {
    const useOnlyAvailableDatabase =
      !this.props.selectedDatabaseId &&
      this.props.databases.length === 1 &&
      !this.props.segments;
    if (useOnlyAvailableDatabase) {
      setTimeout(() => this.onChangeDatabase(0));
    }

    this.hydrateActiveStep();
  }

  componentWillReceiveProps(nextProps) {
    const newStateProps = this.getStepsAndSelectedEntities(nextProps);

    // only update non-empty properties
    this.setState(_.pick(newStateProps, propValue => !!propValue));
  }

  hydrateActiveStep() {
    if (this.props.selectedFieldId) {
      this.switchToStep(FIELD_STEP);
    } else if (this.props.selectedSegmentId) {
      this.switchToStep(SEGMENT_OR_TABLE_STEP);
    } else if (this.props.selectedTableId) {
      if (this.props.segments) {
        this.switchToStep(SEGMENT_OR_TABLE_STEP);
      } else {
        this.switchToStep(TABLE_STEP);
      }
    } else {
      let firstStep = this.state.steps[0];
      this.switchToStep(firstStep);
    }
  }

  nextStep = (stateChange = {}) => {
    let activeStepIndex = this.state.steps.indexOf(this.state.activeStep);
    if (activeStepIndex + 1 >= this.state.steps.length) {
      this.setState(stateChange);
      this.refs.popover.toggle();
    } else {
      const nextStep = this.state.steps[activeStepIndex + 1];
      this.switchToStep(nextStep, stateChange);
    }
  };

  switchToStep = async (stepName, stateChange = {}) => {
    const updatedState = {
      ...this.state,
      ...stateChange,
      activeStep: stepName,
    };

    const loadersForSteps = {
      [FIELD_STEP]: () =>
        updatedState.selectedTable &&
        this.props.fetchTableMetadata(updatedState.selectedTable.id),
    };

    if (loadersForSteps[stepName]) {
      this.setState({ ...updatedState, isLoading: true });
      await loadersForSteps[stepName]();
    }

    this.setState({
      ...updatedState,
      isLoading: false,
    });
  };

  hasPreviousStep = () => {
    return !!this.state.steps[
      this.state.steps.indexOf(this.state.activeStep) - 1
    ];
  };

  hasAdjacentStep = () => {
    return !!this.state.steps[
      this.state.steps.indexOf(this.state.activeStep) + 1
    ];
  };

  onBack = () => {
    if (!this.hasPreviousStep()) {
      return;
    }
    const previousStep = this.state.steps[
      this.state.steps.indexOf(this.state.activeStep) - 1
    ];
    this.switchToStep(previousStep);
  };

  onChangeDatabase = (index, schemaInSameStep) => {
    let database = this.state.databases[index];
    let schema =
      database && (database.schemas.length > 1 ? null : database.schemas[0]);
    if (database && database.tables.length === 0) {
      schema = {
        database: database,
        name: "",
        tables: [],
      };
    }
    const stateChange = {
      selectedDatabase: database,
      selectedSchema: schema,
    };

    this.props.setDatabaseFn && this.props.setDatabaseFn(database.id);

    if (schemaInSameStep) {
      if (database.schemas.length > 1) {
        this.setState(stateChange);
      } else {
        this.nextStep(stateChange);
      }
    } else {
      this.nextStep(stateChange);
    }
  };

  onChangeSchema = schema => {
    this.nextStep({ selectedSchema: schema });
  };

  onChangeTable = item => {
    if (item.table != null) {
      this.props.setSourceTableFn && this.props.setSourceTableFn(item.table.id);
      this.nextStep({ selectedTable: item.table });
    }
  };

  onChangeField = item => {
    if (item.field != null) {
      this.props.setFieldFn && this.props.setFieldFn(item.field.id);
      this.nextStep({ selectedField: item.field });
    }
  };

  onChangeSegment = item => {
    if (item.segment != null) {
      this.props.setSourceSegmentFn &&
        this.props.setSourceSegmentFn(item.segment.id);
      this.nextStep({ selectedTable: null, selectedSegment: item.segment });
    }
  };

  onShowSegmentSection = () => {
    // Jumping to the next step SEGMENT_OR_TABLE_STEP without a db/schema
    // indicates that we want to show the segment section
    this.nextStep({ selectedDatabase: null, selectedSchema: null });
  };

  getTriggerElement() {
    const {
      className,
      style,
      triggerIconSize,
      getTriggerElementContent,
    } = this.props;
    const {
      selectedDatabase,
      selectedSegment,
      selectedTable,
      selectedField,
    } = this.state;

    return (
      <span
        className={className || "px2 py2 text-bold cursor-pointer text-default"}
        style={style}
      >
        {React.createElement(getTriggerElementContent, {
          selectedDatabase,
          selectedSegment,
          selectedTable,
          selectedField,
        })}
        <Icon className="ml1" name="chevrondown" size={triggerIconSize || 8} />
      </span>
    );
  }

  renderActiveStep() {
    const {
      segments,
      skipDatabaseSelection,
      disabledTableIds,
      disabledSegmentIds,
    } = this.props;
    const {
      databases,
      isLoading,
      selectedDatabase,
      selectedSchema,
      selectedTable,
      selectedField,
      selectedSegment,
    } = this.state;

    const hasAdjacentStep = this.hasAdjacentStep();

    switch (this.state.activeStep) {
      case DATABASE_STEP:
        return (
          <DatabasePicker
            databases={databases}
            selectedDatabase={selectedDatabase}
            onChangeDatabase={this.onChangeDatabase}
            hasAdjacentStep={hasAdjacentStep}
          />
        );
      case DATABASE_SCHEMA_STEP:
        return (
          <DatabaseSchemaPicker
            skipDatabaseSelection={skipDatabaseSelection}
            databases={databases}
            selectedDatabase={selectedDatabase}
            selectedSchema={selectedSchema}
            onChangeSchema={this.onChangeSchema}
            onChangeDatabase={this.onChangeDatabase}
            hasAdjacentStep={hasAdjacentStep}
          />
        );
      case SCHEMA_STEP:
        return (
          <SchemaPicker
            selectedDatabase={selectedDatabase}
            selectedSchema={selectedSchema}
            onChangeSchema={this.onChangeSchema}
            hasAdjacentStep={hasAdjacentStep}
          />
        );
      case SCHEMA_AND_SEGMENTS_STEP:
        return (
          <SegmentAndDatabasePicker
            databases={databases}
            selectedSchema={selectedSchema}
            onChangeSchema={this.onChangeSchema}
            onShowSegmentSection={this.onShowSegmentSection}
            onChangeDatabase={this.onChangeDatabase}
            hasAdjacentStep={hasAdjacentStep}
          />
        );
      case TABLE_STEP:
        return (
          <TablePicker
            selectedDatabase={selectedDatabase}
            selectedSchema={selectedSchema}
            selectedTable={selectedTable}
            databases={databases}
            segments={segments}
            disabledTableIds={disabledTableIds}
            onChangeTable={this.onChangeTable}
            onBack={this.hasPreviousStep() && this.onBack}
            hasAdjacentStep={hasAdjacentStep}
          />
        );
      case FIELD_STEP:
        return (
          <FieldPicker
            isLoading={isLoading}
            selectedTable={selectedTable}
            selectedField={selectedField}
            onChangeField={this.onChangeField}
            onBack={this.onBack}
          />
        );
      case SEGMENT_OR_TABLE_STEP:
        if (selectedDatabase && selectedSchema) {
          return (
            <TablePicker
              selectedDatabase={selectedDatabase}
              selectedSchema={selectedSchema}
              selectedTable={selectedTable}
              databases={databases}
              segments={segments}
              disabledTableIds={disabledTableIds}
              onChangeTable={this.onChangeTable}
              hasPreviousStep={this.hasPreviousStep}
              onBack={this.onBack}
            />
          );
        } else {
          return (
            <SegmentPicker
              segments={segments}
              selectedSegment={selectedSegment}
              disabledSegmentIds={disabledSegmentIds}
              onBack={this.onBack}
              onChangeSegment={this.onChangeSegment}
            />
          );
        }
    }

    return null;
  }

  render() {
    const triggerClasses = this.props.renderAsSelect
      ? "border-med bg-white block no-decoration"
      : "flex align-center";
    return (
      <PopoverWithTrigger
        id="DataPopover"
        ref="popover"
        isInitiallyOpen={this.props.isInitiallyOpen}
        triggerElement={this.getTriggerElement()}
        triggerClasses={triggerClasses}
        horizontalAttachments={["center", "left", "right"]}
        sizeToFit
      >
        {this.renderActiveStep()}
      </PopoverWithTrigger>
    );
  }
}

const DatabasePicker = ({
  databases,
  selectedDatabase,
  onChangeDatabase,
  hasAdjacentStep,
}) => {
  if (databases.length === 0) {
    return <DataSelectorLoading />;
  }

  let sections = [
    {
      items: databases.map((database, index) => ({
        name: database.name,
        index,
        database: database,
      })),
    },
  ];

  return (
    <AccordianList
      id="DatabasePicker"
      key="databasePicker"
      className="text-brand"
      sections={sections}
      onChange={db => onChangeDatabase(db.index)}
      itemIsSelected={item =>
        selectedDatabase && item.database.id === selectedDatabase.id
      }
      renderItemIcon={() => (
        <Icon className="Icon text-default" name="database" size={18} />
      )}
      showItemArrows={hasAdjacentStep}
    />
  );
};

const SegmentAndDatabasePicker = ({
  databases,
  selectedSchema,
  onChangeSchema,
  onShowSegmentSection,
  onChangeDatabase,
  hasAdjacentStep,
}) => {
  const segmentItem = [{ name: "Segments", items: [], icon: "segment" }];

  const sections = segmentItem.concat(
    databases.map(database => {
      return {
        name: database.name,
        items: database.schemas.length > 1 ? database.schemas : [],
      };
    }),
  );

  // FIXME: this seems a bit brittle and hard to follow
  let openSection =
    selectedSchema &&
    _.findIndex(databases, db => _.find(db.schemas, selectedSchema)) +
      segmentItem.length;
  if (
    openSection >= 0 &&
    databases[openSection - segmentItem.length] &&
    databases[openSection - segmentItem.length].schemas.length === 1
  ) {
    openSection = -1;
  }

  return (
    <AccordianList
      id="SegmentAndDatabasePicker"
      key="segmentAndDatabasePicker"
      className="text-brand"
      sections={sections}
      onChange={onChangeSchema}
      onChangeSection={index => {
        index === 0
          ? onShowSegmentSection()
          : onChangeDatabase(index - segmentItem.length, true);
      }}
      itemIsSelected={schema => selectedSchema === schema}
      renderSectionIcon={section => (
        <Icon
          className="Icon text-default"
          name={section.icon || "database"}
          size={18}
        />
      )}
      renderItemIcon={() => <Icon name="folder" size={16} />}
      initiallyOpenSection={openSection}
      showItemArrows={hasAdjacentStep}
      alwaysTogglable={true}
    />
  );
};

export const SchemaPicker = ({
  selectedDatabase,
  selectedSchema,
  onChangeSchema,
  hasAdjacentStep,
}) => {
  let sections = [
    {
      items: selectedDatabase.schemas,
    },
  ];
  return (
    <div style={{ width: 300 }}>
      <AccordianList
        id="DatabaseSchemaPicker"
        key="databaseSchemaPicker"
        className="text-brand"
        sections={sections}
        searchable
        onChange={onChangeSchema}
        itemIsSelected={schema => schema === selectedSchema}
        renderItemIcon={() => <Icon name="folder" size={16} />}
        showItemArrows={hasAdjacentStep}
      />
    </div>
  );
};

export const DatabaseSchemaPicker = ({
  skipDatabaseSelection,
  databases,
  selectedDatabase,
  selectedSchema,
  onChangeSchema,
  onChangeDatabase,
  hasAdjacentStep,
}) => {
  if (databases.length === 0) {
    return <DataSelectorLoading />;
  }

  const sections = databases.map(database => ({
    name: database.name,
    items: database.schemas.length > 1 ? database.schemas : [],
    className: database.is_saved_questions ? "bg-light" : null,
    icon: database.is_saved_questions ? "all" : "database",
  }));

  let openSection =
    selectedSchema &&
    _.findIndex(databases, db => _.find(db.schemas, selectedSchema));
  if (
    openSection >= 0 &&
    databases[openSection] &&
    databases[openSection].schemas.length === 1
  ) {
    openSection = -1;
  }

  return (
    <div className="scroll-y">
      <AccordianList
        id="DatabaseSchemaPicker"
        key="databaseSchemaPicker"
        className="text-brand"
        sections={sections}
        onChange={onChangeSchema}
        onChangeSection={dbId => onChangeDatabase(dbId, true)}
        itemIsSelected={schema => schema === selectedSchema}
        renderSectionIcon={item => (
          <Icon className="Icon text-default" name={item.icon} size={18} />
        )}
        renderItemIcon={() => <Icon name="folder" size={16} />}
        initiallyOpenSection={openSection}
        alwaysTogglable={true}
        showItemArrows={hasAdjacentStep}
      />
    </div>
  );
};

export const TablePicker = ({
  selectedDatabase,
  selectedSchema,
  selectedTable,
  disabledTableIds,
  onChangeTable,
  hasAdjacentStep,
  onBack,
}) => {
  // In case DataSelector props get reseted
  if (!selectedDatabase) {
    if (onBack) {
      onBack();
    }
    return null;
  }

  const isSavedQuestionList = selectedDatabase.is_saved_questions;
  let header = (
    <div className="flex flex-wrap align-center">
      <span
        className={cx("flex align-center", {
          "text-brand-hover cursor-pointer": onBack,
        })}
        onClick={onBack}
      >
        {onBack && <Icon name="chevronleft" size={18} />}
        <span className="ml1">{selectedDatabase.name}</span>
      </span>
      {selectedSchema.name && (
        <span className="ml1 text-slate">- {selectedSchema.name}</span>
      )}
    </div>
  );

  if (selectedSchema.tables.length === 0) {
    // this is a database with no tables!
    return (
      <section
        className="List-section List-section--open"
        style={{ width: 300 }}
      >
        <div className="p1 border-bottom">
          <div className="px1 py1 flex align-center">
            <h3 className="text-default">{header}</h3>
          </div>
        </div>
        <div className="p4 text-centered">{t`No tables found in this database.`}</div>
      </section>
    );
  } else {
    let sections = [
      {
        name: header,
        items: selectedSchema.tables.map(table => ({
          name: table.display_name,
          disabled: disabledTableIds && disabledTableIds.includes(table.id),
          table: table,
          database: selectedDatabase,
        })),
      },
    ];
    return (
      <div style={{ width: 300 }} className="scroll-y">
        <AccordianList
          id="TablePicker"
          key="tablePicker"
          className="text-brand"
          sections={sections}
          searchable
          onChange={onChangeTable}
          itemIsSelected={item =>
            item.table && selectedTable
              ? item.table.id === selectedTable.id
              : false
          }
          itemIsClickable={item => item.table && !item.disabled}
          renderItemIcon={item =>
            item.table ? <Icon name="table2" size={18} /> : null
          }
          showItemArrows={hasAdjacentStep}
        />
        {isSavedQuestionList && (
          <div className="bg-light p2 text-centered border-top">
            {t`Is a question missing?`}
            <a
              href="http://metabase.com/docs/latest/users-guide/04-asking-questions.html#source-data"
              className="block link"
            >{t`Learn more about nested queries`}</a>
          </div>
        )}
      </div>
    );
  }
};

@connect(state => ({ metadata: getMetadata(state) }))
export class FieldPicker extends Component {
  render() {
    const {
      isLoading,
      selectedTable,
      selectedField,
      onChangeField,
      metadata,
      onBack,
    } = this.props;
    // In case DataSelector props get reseted
    if (!selectedTable) {
      if (onBack) {
        onBack();
      }
      return null;
    }

    const header = (
      <span className="flex align-center">
        <span
          className="flex align-center text-slate cursor-pointer"
          onClick={onBack}
        >
          <Icon name="chevronleft" size={18} />
          <span className="ml1">{selectedTable.display_name || t`Fields`}</span>
        </span>
      </span>
    );

    if (isLoading) {
      return <DataSelectorLoading header={header} />;
    }

    const table = metadata.tables[selectedTable.id];
    const fields = (table && table.fields) || [];
    const sections = [
      {
        name: header,
        items: fields.map(field => ({
          name: field.display_name,
          field: field,
        })),
      },
    ];

    return (
      <div style={{ width: 300 }}>
        <AccordianList
          id="FieldPicker"
          key="fieldPicker"
          className="text-brand"
          sections={sections}
          searchable
          onChange={onChangeField}
          itemIsSelected={item =>
            item.field && selectedField
              ? item.field.id === selectedField.id
              : false
          }
          itemIsClickable={item => item.field && !item.disabled}
          renderItemIcon={item =>
            item.field ? (
              <Icon name={item.field.dimension().icon()} size={18} />
            ) : null
          }
        />
      </div>
    );
  }
}

//TODO: refactor this. lots of shared code with renderTablePicker = () =>
export const SegmentPicker = ({
  segments,
  selectedSegment,
  disabledSegmentIds,
  onBack,
  onChangeSegment,
}) => {
  const header = (
    <span className="flex align-center">
      <span
        className="flex align-center text-slate cursor-pointer"
        onClick={onBack}
      >
        <Icon name="chevronleft" size={18} />
        <span className="ml1">{t`Segments`}</span>
      </span>
    </span>
  );

  if (!segments || segments.length === 0) {
    return (
      <section
        className="List-section List-section--open"
        style={{ width: "300px" }}
      >
        <div className="p1 border-bottom">
          <div className="px1 py1 flex align-center">
            <h3 className="text-default">{header}</h3>
          </div>
        </div>
        <div className="p4 text-centered">{t`No segments were found.`}</div>
      </section>
    );
  }

  const sections = [
    {
      name: header,
      items: segments.map(segment => ({
        name: segment.name,
        segment: segment,
        disabled: disabledSegmentIds && disabledSegmentIds.includes(segment.id),
      })),
    },
  ];

  return (
    <AccordianList
      id="SegmentPicker"
      key="segmentPicker"
      className="text-brand"
      sections={sections}
      searchable
      searchPlaceholder={t`Find a segment`}
      onChange={onChangeSegment}
      itemIsSelected={item =>
        selectedSegment && item.segment
          ? item.segment.id === selectedSegment.id
          : false
      }
      itemIsClickable={item => item.segment && !item.disabled}
      renderItemIcon={item =>
        item.segment ? <Icon name="segment" size={18} /> : null
      }
    />
  );
};

const DataSelectorLoading = ({ header }) => {
  if (header) {
    return (
      <section
        className="List-section List-section--open"
        style={{ width: 300 }}
      >
        <div className="p1 border-bottom">
          <div className="px1 py1 flex align-center">
            <h3 className="text-default">{header}</h3>
          </div>
        </div>
        <LoadingAndErrorWrapper loading />;
      </section>
    );
  } else {
    return <LoadingAndErrorWrapper loading />;
  }
};
