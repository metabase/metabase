import React, { Component } from "react";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";

import Icon from "metabase/components/Icon";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import AccordionList from "metabase/components/AccordionList";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import { isQueryable } from "metabase/lib/table";
import { titleize, humanize } from "metabase/lib/formatting";
import MetabaseSettings from "metabase/lib/settings";

import Databases from "metabase/entities/databases";
import Tables from "metabase/entities/tables";

import { getMetadata } from "metabase/selectors/metadata";

import _ from "underscore";

// chooses a database
const DATABASE_STEP = "DATABASE";
// chooses a database and a schema inside that database
const DATABASE_SCHEMA_STEP = "DATABASE_SCHEMA";
// chooses a schema (given that a database has already been selected)
const SCHEMA_STEP = "SCHEMA";
// chooses a table (database has already been selected)
const TABLE_STEP = "TABLE";
// chooses a table field (table has already been selected)
const FIELD_STEP = "FIELD";

export const DatabaseDataSelector = props => (
  <DataSelector
    steps={[DATABASE_STEP]}
    getTriggerElementContent={DatabaseTriggerContent}
    {...props}
  />
);

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

export const SchemaTableAndFieldDataSelector = props => (
  <DataSelector
    steps={[SCHEMA_STEP, TABLE_STEP, FIELD_STEP]}
    getTriggerElementContent={FieldTriggerContent}
    {...props}
  />
);

const DatabaseTriggerContent = ({ selectedDatabase }) =>
  selectedDatabase ? (
    <span className="text-wrap text-grey no-decoration">
      {selectedDatabase.name}
    </span>
  ) : (
    <span className="text-medium no-decoration">{t`Select a database`}</span>
  );

const TableTriggerContent = ({ selectedTable }) =>
  selectedTable ? (
    <span className="text-wrap text-grey no-decoration">
      {selectedTable.display_name || selectedTable.name}
    </span>
  ) : (
    <span className="text-medium no-decoration">{t`Select a table`}</span>
  );

const FieldTriggerContent = ({ selectedDatabase, selectedField }) => {
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

@connect(
  (state, ownProps) => ({
    metadata: getMetadata(state),
    databases:
      ownProps.databases ||
      Databases.selectors.getList(state, {
        entityQuery: { ...ownProps.databaseQuery, include_tables: true },
      }) ||
      [],
  }),
  {
    fetchDatabases: databaseQuery =>
      Databases.actions.fetchList({
        ...databaseQuery,
        include_tables: true,
      }),
    fetchTableMetadata: id => Tables.actions.fetchTableMetadata({ id }),
  },
)
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
        for (const table of database.tables.filter(isQueryable)) {
          const name = table.schema || "";
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
      : databases.length === 1
      ? databases[0]
      : null;
    const hasMultipleSchemas =
      selectedDatabase &&
      _.uniq(selectedDatabase.tables, t => t.schema).length > 1;

    // remove the schema step if a database is already selected and the database does not have more than one schema.
    const steps = [...props.steps];
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

    const selectedField = props.selectedFieldId
      ? props.metadata.fields[props.selectedFieldId]
      : null;

    return {
      databases,
      selectedDatabase,
      selectedSchema,
      selectedTable,
      selectedField,
      steps,
    };
  };

  static propTypes = {
    selectedDatabaseId: PropTypes.number,
    selectedTableId: PropTypes.number,
    selectedFieldId: PropTypes.number,
    databases: PropTypes.array.isRequired,
    setDatabaseFn: PropTypes.func,
    setFieldFn: PropTypes.func,
    setSourceTableFn: PropTypes.func,
    isInitiallyOpen: PropTypes.bool,
    renderAsSelect: PropTypes.bool,
  };

  static defaultProps = {
    isInitiallyOpen: false,
    renderAsSelect: false,
  };

  componentWillMount() {
    this.hydrateActiveStep();
  }

  componentDidMount() {
    const useOnlyAvailableDatabase =
      !this.props.selectedDatabaseId && this.props.databases.length === 1;
    if (useOnlyAvailableDatabase) {
      this.onChangeDatabase(0, true);
    }
  }

  componentWillReceiveProps(nextProps) {
    const newStateProps = this.getStepsAndSelectedEntities(nextProps);

    // only update non-empty properties
    this.setState(_.pick(newStateProps, propValue => !!propValue));
  }

  hydrateActiveStep() {
    if (this.props.selectedFieldId) {
      this.switchToStep(FIELD_STEP);
    } else if (this.props.selectedTableId) {
      this.switchToStep(TABLE_STEP);
    } else {
      const firstStep = this.state.steps[0];
      this.switchToStep(firstStep);
    }
  }

  nextStep = (stateChange = {}) => {
    const activeStepIndex = this.state.steps.indexOf(this.state.activeStep);
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
      [DATABASE_STEP]: () =>
        this.props.fetchDatabases(this.props.databaseQuery),
      [DATABASE_SCHEMA_STEP]: () =>
        this.props.fetchDatabases(this.props.databaseQuery),
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
    const database = this.state.databases[index];
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

  getTriggerElement() {
    const {
      className,
      style,
      triggerIconSize,
      triggerElement,
      getTriggerElementContent,
    } = this.props;

    if (triggerElement) {
      return triggerElement;
    }

    const { selectedDatabase, selectedTable, selectedField } = this.state;

    return (
      <span
        className={className || "px2 py2 text-bold cursor-pointer text-default"}
        style={style}
      >
        {React.createElement(getTriggerElementContent, {
          selectedDatabase,
          selectedTable,
          selectedField,
        })}
        <Icon className="ml1" name="chevrondown" size={triggerIconSize || 8} />
      </span>
    );
  }

  getTriggerClasses() {
    if (this.props.triggerClasses) {
      return this.props.triggerClasses;
    }
    return this.props.renderAsSelect
      ? "border-medium bg-white block no-decoration"
      : "flex align-center";
  }

  renderActiveStep() {
    const {
      databases,
      isLoading,
      selectedDatabase,
      selectedSchema,
      selectedTable,
      selectedField,
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
      case TABLE_STEP:
        return (
          <TablePicker
            selectedDatabase={selectedDatabase}
            selectedSchema={selectedSchema}
            selectedTable={selectedTable}
            databases={databases}
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
    }

    return null;
  }

  render() {
    return (
      <PopoverWithTrigger
        id="DataPopover"
        ref="popover"
        isInitiallyOpen={this.props.isInitiallyOpen}
        triggerElement={this.getTriggerElement()}
        triggerClasses={this.getTriggerClasses()}
        horizontalAttachments={["center", "left", "right"]}
        hasArrow={this.props.hasArrow}
        tetherOptions={this.props.tetherOptions}
        sizeToFit
        isOpen={this.props.isOpen}
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

  const sections = [
    {
      items: databases.map((database, index) => ({
        name: database.name,
        index,
        database: database,
      })),
    },
  ];

  return (
    <AccordionList
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

const SchemaPicker = ({
  selectedDatabase,
  selectedSchema,
  onChangeSchema,
  hasAdjacentStep,
}) => {
  const sections = [
    {
      items: selectedDatabase.schemas,
    },
  ];
  return (
    <div style={{ width: 300 }}>
      <AccordionList
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

const DatabaseSchemaPicker = ({
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
    <AccordionList
      id="DatabaseSchemaPicker"
      key="databaseSchemaPicker"
      className="text-brand"
      sections={sections}
      onChange={onChangeSchema}
      onChangeSection={(section, sectionIndex) =>
        onChangeDatabase(sectionIndex, true)
      }
      itemIsSelected={schema => schema === selectedSchema}
      renderSectionIcon={item => (
        <Icon className="Icon text-default" name={item.icon} size={18} />
      )}
      renderItemIcon={() => <Icon name="folder" size={16} />}
      initiallyOpenSection={openSection}
      alwaysTogglable={true}
      showItemArrows={hasAdjacentStep}
    />
  );
};

const TablePicker = ({
  selectedDatabase,
  selectedSchema,
  selectedTable,
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
  const header = (
    <div className="flex flex-wrap align-center">
      <span
        className={cx("flex align-center", {
          "text-brand-hover cursor-pointer": onBack,
        })}
        onClick={onBack}
      >
        {onBack && <Icon name="chevronleft" size={18} />}
        <span className="ml1 text-wrap">{selectedDatabase.name}</span>
      </span>
      {selectedSchema.name && (
        <span className="ml1 text-wrap text-slate">
          - {selectedSchema.name}
        </span>
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
    const sections = [
      {
        name: header,
        items: selectedSchema.tables.map(table => ({
          name: table.display_name,
          table: table,
          database: selectedDatabase,
        })),
      },
    ];
    return (
      <div>
        <AccordionList
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
              href={MetabaseSettings.docsUrl(
                "users-guide/04-asking-questions",
                "source-data",
              )}
              className="block link"
            >{t`Learn more about nested queries`}</a>
          </div>
        )}
      </div>
    );
  }
};

@connect(state => ({ metadata: getMetadata(state) }))
class FieldPicker extends Component {
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
          <span className="ml1 text-wrap">
            {selectedTable.display_name || t`Fields`}
          </span>
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
        <AccordionList
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
