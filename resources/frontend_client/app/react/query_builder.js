/* jshint ignore:start */
/* @jsx React.DOM */
'use strict';
var cx = React.addons.classSet,
    ReactCSSTransitionGroup = React.addons.CSSTransitionGroup;

var ResultTable = React.createClass({
    render: function () {
        var table,
            tableHeaders,
            tableRows

        // we have a result to show
        if(this.props.result && this.props.result.data) {
            tableRows = this.props.result.data.rows.map(function (row) {
                var rowCols = row.map(function (data) {
                    return (<td>{data}</td>)
                })

                return (<tr>{rowCols}</tr>)
            })

            tableHeaders = this.props.result.data.columns.map(function (column) {
                return (
                    <th>{column}</th>
                )
            })

            table = (
                <table className="QueryTable Table">
                    <thead>
                        <tr>
                            {tableHeaders}
                        </tr>
                    </thead>
                    <tbody>
                        {tableRows}
                    </tbody>
                </table>
            )
        }

        return (
            <div className="Table-wrapper">
                {table}
            </div>
        )
    }
})

var Saver = React.createClass({
    mixins: [OnClickOutside],
    getInitialState: function () {
        return {
            modalOpen: false,
            triggerAction: this._openModal
        }
    },
    handleClickOutside: function () {
        this.replaceState(this.getInitialState())
    },
    _openModal: function () {
        this.setState({
            modalOpen: true,
            triggerAction: this._save
        }, function () {
            // focus the name field
            this.refs.name.getDOMNode().focus()
        })
    },
    _save: function () {
        var name = this.refs.name.getDOMNode().value,
            description = this.refs.description.getDOMNode().value

        this.props.save({
            name: name,
            description: description
        })
        // reset the modal
        this.setState({
            modalOpen: false,
            triggerAction: this._openModal
        })
    },
    render: function () {
        var buttonClasses = cx({
            'SaveButton': true,
            'ActionButton': true,
            'block': true,
            'ActionButton--primary': this.state.modalOpen
        })
        var modalClasses = cx({
            'SaveModal': true,
            'Modal--showing': this.state.modalOpen
        })

        var buttonText;

        // if the query has changed or the modal has been opened
        if(this.props.hasChanged == true || this.state.modalOpen == true) {
            buttonText = "Save"
        } else {
            buttonText = "Edit"
        }

        return (
            <div className="SaveWrapper float-right mr2">
                <div className={modalClasses}>
                    <div className="ModalContent">
                        <input ref="name" type="text" placeholder="Name" autofocus defaultValue={this.props.name} />
                        <input ref="description" type="text" placeholder="Add a description" defaultValue={this.props.description}/>
                        <div className="mt4 clearfix">
                            <span className="text-grey-3 inline-block my1">Privacy:</span>
                            <div className="float-right">
                                <SelectionModule
                                    placeholder="Privacy"
                                    items={[['0', 'Private'], ['1', 'Others can read'], ['2', 'Others can modify']]}
                                    selectedKey='0'
                                    selectedValue='1'
                                    display='1'
                                />
                            </div>
                        </div>
                    </div>
                </div>
                <a className={buttonClasses} onClick={this.state.triggerAction}>
                    {buttonText}
                </a>
            </div>
        )

    }
})

var SearchBar = React.createClass({
    handleInputChange: function () {
        this.props.onFilter(this.refs.filterTextInput.getDOMNode().value)
    },
    render: function () {
        return(
            <input className="SearchBar" type="text" ref="filterTextInput" value={this.props.filter} placeholder="Search for" onChange={this.handleInputChange}/>
        )
    }
})

var SelectionModule = React.createClass({
    mixins: [OnClickOutside],
    getInitialState: function () {
        // a selection module can be told to be open on initialization but otherwise is closed
        var isInitiallyOpen = this.props.isInitiallyOpen || false;

        return {
            open: isInitiallyOpen,
            searchThreshold: 20,
            searchEnabled: false,
            filterTerm: null
        }
    },
    handleClickOutside: function () {
        this.setState({
            open: false
        })
    },
    _enableSearch: function () {
        /*
        not showing search for now
        if(this.props.items.length > this.state.searchThreshold) {
            return true
        } else {
            return false
        }
        */
        return false
    },
    _toggleOpen: function () {
        var open = this.state.open
        open = !open
        this.setState({
            open: open
        })
    },
    _displayCustom: function (values) {
        var custom = []
        this.props.children.forEach(function (element) {
            var newElement = element
            newElement.props.children = values[newElement.props.content]
            custom.push(element)
        })
        return custom
    },
    _listItems: function (selection) {
        var items,
            remove
        if(this.props.items) {
            items = this.props.items.map(function (item, index) {
                var display = item[this.props.display] || item
                var itemClassName = cx({
                    'SelectionItem' : true,
                    'selected': selection == display
                })
                // if children are provided, use the custom layout display
                return(
                    <li className={itemClassName} onClick={this._select.bind(null, item)} key={index}>
                        <span className="SelectionModule-display">
                            {display}
                        </span>
                    </li>
                )
            }.bind(this))
            return items
        } else {
            return "Sorry. Something went wrong."
        }
    },
    _select: function (item) {
        var index = this.props.index
        // send back the item with the specified action
        if(this.props.action) {
            if(index != undefined) {
                if(this.props.parentIndex) {
                    this.props.action(item[this.props.selectedKey], index, this.props.parentIndex)
                } else {
                    this.props.action(item[this.props.selectedKey], index)
                }
            } else {
                this.props.action(item[this.props.selectedKey])
            }
        }
        this._toggleOpen()
    },
    render: function () {
        var selection
        this.props.items.map(function (item) {
            if(item[this.props.selectedKey] === this.props.selectedValue) {
                selection = item[this.props.display];
            }
        }.bind(this));

        var placeholder = selection || this.props.placeholder,
            searchBar,
            remove,
            removeable = false

        if(this.props.remove) {
            removeable = true
        }

        var moduleClasses = cx({
            'SelectionModule': true,
            'relative': true,
            'selected': selection,
            'removeable': removeable
        })

        var itemListClasses = cx({
            'SelectionItems': true,
            'open' : this.state.open
        })

        if(this._enableSearch()) {
            searchBar = <SearchBar onFilter={this._filterSelections} />
        }

        if(this.props.remove) {
            var style = {
                fill: '#ddd'
            }
            remove = (
                <a className="RemoveTrigger" href="#" onClick={this.props.remove.bind(null, this.props.index)}>
                    <svg className="geomicon" data-icon="close" viewBox="0 0 32 32" style={style} width="16px" height="16px">
                        <path d="M4 8 L8 4 L16 12 L24 4 L28 8 L20 16 L28 24 L24 28 L16 20 L8 28 L4 24 L12 16 z "></path>
                    </svg>
                </a>
            )
        }

        return (
            <div className={moduleClasses}>
                <div className="SelectionModule-trigger">
                    <a className="SelectionTitle" onClick={this._toggleOpen}>
                        {placeholder}
                    </a>
                    {remove}
                </div>
                <div className={itemListClasses}>
                    {searchBar}
                    <ul className="SelectionList">
                        {this._listItems(selection)}
                    </ul>
                </div>
            </div>
        )
    }
})

var QueryPicker = React.createClass({
    render: function () {

        /* @souce table */
        var sourceTableSelection = this.props.query.source_table,
            sourceTableListOpen = true

        if(sourceTableSelection) {
            sourceTableListOpen = false
        }

        /* @aggregation table */
        var aggregationSelectionHtml,
            aggregationSelection = this.props.query.aggregation[0],
            aggregationListOpen = true

        if(aggregationSelection) {
            aggregationListOpen = false
        }

        /* @aggregation target */
        var aggregationTargetHtml,
            aggregationTargetListOpen = true

        var dimensionList,
            addDimensionButton,
            addDimensionButtonText

        if(this.props.aggregationComplete()) {

            (this.props.query.breakout.length < 1) ? addDimensionButtonText = "Grouped by" : addDimensionButtonText = "and"

            if(this.props.query.breakout.length < 2) {
                addDimensionButton = (
                    <a className="ActionButton" onClick={this.props.addDimension}>{addDimensionButtonText}</a>
                )
            }

            if(this.props.options.breakout_options) {
                dimensionList = this.props.query.breakout.map(function (breakout, index) {
                        var  open
                        if(breakout === null) {
                            open = true
                        }

                        return (
                            <div className="DimensionList inline-block">
                                <SelectionModule
                                    placeholder='What part of your data?'
                                    display='1'
                                    items={this.props.options.breakout_options.fields}
                                    selectedValue={breakout}
                                    selectedKey='0'
                                    index={index}
                                    isInitiallyOpen={open}
                                    action={this.props.updateDimension}
                                    remove={this.props.removeDimension}
                                />
                            </div>
                        )
                }.bind(this))
            }
        }

        var dimensionLabel

        if(this.props.query.breakout.length > 0) {
            dimensionLabel = (
                <div className="text-grey-3 inline-block mx2">
                    Grouped by:
                </div>
            )
        }


        if(this.props.options) {
            aggregationSelectionHtml = (
                <SelectionModule
                    placeholder='And I want to see...'
                    items={this.props.options.aggregation_options}
                    display='name'
                    selectedValue={aggregationSelection}
                    selectedKey='short'
                    isInitiallyOpen={aggregationListOpen}
                    action={this.props.setAggregation}
                />
            )

            // if there's a value in the second aggregation slot
            if(this.props.query.aggregation.length > 1) {
                if(this.props.query.aggregation[1] !== null) {
                    aggregationTargetListOpen = false
                }
                aggregationTargetHtml = (
                    <SelectionModule
                        placeholder='Lets start with...'
                        items={this.props.aggregationFieldList[0]}
                        display='1'
                        selectedValue={this.props.query.aggregation[1]}
                        selectedKey='0'
                        isInitiallyOpen={aggregationTargetListOpen}
                        action={this.props.setAggregationTarget}
                    />
                )
            }
        }

        var querySelection;
        // tables are provided if we have a selected database
        if(this.props.tables) {
            querySelection = (
                <div>
                    <div className="Metric-sourceTable inline-block">
                        <SelectionModule
                            placeholder='Lets start with...'
                            items={this.props.tables}
                            display='name'
                            selectedValue={this.props.query.source_table}
                            selectedKey='id'
                            isInitiallyOpen={sourceTableListOpen}
                            action={this.props.setSourceTable}
                        />
                    </div>

                    <div className="inline-block mx2">
                        {aggregationSelectionHtml}
                        {aggregationTargetHtml}
                    </div>
                    {dimensionLabel}
                    {dimensionList}
                    {addDimensionButton}
                </div>
            )
        } else {
            querySelection = (
                <div className="inline-block">
                    <SelectionModule
                        placeholder="What database would you like to work with?"
                        items={this.props.dbList}
                        action={this.props.setDatabase}
                        isInitiallyOpen={true}
                        selectedKey='id'
                        display='name'
                    />
                </div>
            )
        }

        return (
            <div>
                <div className="QueryBar">
                    {querySelection}
                </div>

            </div>
        )
    }
})

var FilterWidget = React.createClass({
    _updateTextFilterValue: function (index) {
        var value = this.refs.textFilterValue.getDOMNode().value
        // we always know the index will 2 for the value of a filter
        this.props.updateFilter(value, 2, index)
    },
    render: function () {
        var fieldListOpen = true,
            operatorList,
            canShowOperatorList = false,
            operatorListOpen = true,
            valueHtml

        if(this.props.field != null) {
            fieldListOpen = false,
            canShowOperatorList = true
        }

        if(this.props.operator != null) {
            operatorListOpen = false
        }

        if(canShowOperatorList) {
            operatorList = (
                <div className="FilterSection">
                    <SelectionModule
                        placeholder="..."
                        items={this.props.operatorList}
                        display='verbose_name'
                        selectedValue={this.props.operator}
                        selectedKey='name'
                        index={0}
                        isInitiallyOpen={operatorListOpen}
                        parentIndex={this.props.index}
                        action={this.props.updateFilter}
                    />
                </div>
            )
        }

        var style = {
            fill: '#ddd'
        }
        if(this.props.valueFields) {
            if(this.props.valueFields.values) {
                valueHtml = (
                    <SelectionModule
                        placeholder="..."
                        items={this.props.valueFields.values}
                        display='name'
                        selectedValue={this.props.value}
                        selectedKey='key'
                        index='2'
                        parentIndex={this.props.index}
                        isInitiallyOpen={false}
                        action={this.props.updateFilter}
                    />
                )
            } else {
                valueHtml = (
                    <input className="input" type="text" defaultValue={this.props.value} onChange={this._updateTextFilterValue.bind(null, this.props.index)} ref="textFilterValue" placeholder="What value?" />
                )
            }
        }


        return (
            <div className="QueryFilter relative inline-block">
                <div className="FilterSection">
                    <SelectionModule
                        placeholder="..."
                        items={this.props.filterFieldList}
                        display='name'
                        selectedValue={this.props.field}
                        selectedKey='id'
                        index={1}
                        isInitiallyOpen={fieldListOpen}
                        parentIndex={this.props.index}
                        action={this.props.updateFilter}
                    />
                </div>
                {operatorList}
                <div className="FilterSection">
                    {valueHtml}
                </div>
                <a className="RemoveTrigger" href="#" onClick={this.props.remove.bind(null, this.props.index)}>
                    <svg className="geomicon" data-icon="close" viewBox="0 0 32 32" style={style} width="16px" height="16px">
                        <path d="M4 8 L8 4 L16 12 L24 4 L28 8 L20 16 L28 24 L24 28 L16 20 L8 28 L4 24 L12 16 z "></path>
                    </svg>
                </a>
            </div>
        )
    }
})

var QueryHeader = React.createClass({
    render: function () {
        var name = this.props.name || "What would you like to know?";
        return (
            <h1 className="QueryName">{name}</h1>
        )
    }
});

var QueryBuilder = React.createClass({
    render: function () {
        var filterFieldList = [],
            runButton,
            runButtonText,
            filterHtml

        // populate the list of possible filterable fields
        if(this.props.model.selected_table_fields) {
            for(var key in this.props.model.selected_table_fields.fields_lookup) {
                filterFieldList.push(this.props.model.selected_table_fields.fields_lookup[key])
            }
        }

        var filterList = this.props.model.card.dataset_query.query.filter.map(function (filter, index) {

            // this filter object contains multiple filters,
            if(filter != 'AND') {
                // set variables based on array structure

                var operator = filter[0], // name of the operator
                    field = filter[1], // id of the field
                    value = filter[2],

                    operatorList = [],
                    valueFields

                    // extract the real info
                    for(var fieldItem in filterFieldList) {
                        var theField = filterFieldList[fieldItem]

                        if(theField.id == field) {

                            for(var operatorItem in theField.operators_lookup) {
                                var theOperator = theField.operators_lookup[operatorItem]
                                // push the operator into the list we'll use for selection
                                operatorList.push(theOperator)

                                if(theOperator.name == operator) {
                                    // this is structured strangely
                                    valueFields = theOperator.fields[0]
                                }
                            }
                        }
                    }

                    return (
                        <FilterWidget
                            placeholder="Item"
                            field={field}
                            filterFieldList={filterFieldList}
                            operator={operator}
                            operatorList={operatorList}
                            value={value}
                            valueFields={valueFields}
                            index={index}
                            remove={this.props.model.removeFilter.bind(this.props.model)}
                            updateFilter={this.props.model.updateFilter.bind(this.props.model)}
                        />
                    )
            } else {
                return;
            }
        }.bind(this))

        if(this.props.model.canRun()) {
            if(this.props.model.isRunning) {
                runButtonText = "Loading..."
            } else {
                runButtonText = "Find out!"
            }
            runButton = (
                <a className="ActionButton ActionButton--primary float-right"onClick={this.props.model.run.bind(this.props.model)}>{runButtonText}</a>
            )

            filterHtml = (
                <div className="clearfix">
                    <a className="FilterTrigger float-left ActionButton inline-block mr4" onClick={this.props.model.addFilter.bind(this.props.model)}>
                        <svg className="icon" width="16px" height="16px" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M6.57883011,7.57952565 L1.18660637e-12,-4.86721774e-13 L16,-4.92050845e-13 L9.42116989,7.57952565 L9.42116989,13.5542169 L6.57883011,15 L6.57883011,7.57952565 Z"></path>
                        </svg>
                    </a>
                    {filterList}
                </div>
            )
        }

        var queryPickerClasses = cx({
            'QueryPicker-group': true
        })


        return (
            <div className="full-height">
                    <div className="QueryHeader">
                        <div className="wrapper">
                            <QueryHeader
                                name={this.props.model.card.name}
                                user={this.props.model.user}
                            />
                        </div>
                    </div>
                    <div className={queryPickerClasses}>
                        <div>
                            <div className="wrapper">
                                <div className="clearfix">
                                    {runButton}
                                    <QueryPicker
                                        options={this.props.model.selected_table_fields}
                                        tables={this.props.model.table_list}
                                        db={this.props.model.card.dataset_query.database}
                                        aggregationFieldList={this.props.model.aggregation_field_list}
                                        dbList={this.props.model.database_list}
                                        query={this.props.model.card.dataset_query.query}
                                        setDatabase={this.props.model.setDatabase.bind(this.props.model)}
                                        setSourceTable={this.props.model.setSourceTable.bind(this.props.model)}
                                        setAggregation={this.props.model.setAggregation.bind(this.props.model)}
                                        setAggregationTarget={this.props.model.setAggregationTarget.bind(this.props.model)}
                                        addDimension={this.props.model.addDimension.bind(this.props.model)}
                                        removeDimension={this.props.model.removeDimension.bind(this.props.model)}
                                        updateDimension={this.props.model.updateDimension.bind(this.props.model)}
                                        aggregationComplete={this.props.model.aggregationComplete.bind(this.props.model)}
                                    />
                                </div>
                            </div>
                        </div>
                        <div>
                            <div className="wrapper my2">
                                {filterHtml}
                            </div>
                        </div>
                    </div>


                    <div className="wrapper">
                        <ResultTable result={this.props.model.result} />
                    </div>

                    <div className="ActionBar">
                            <Saver
                                save={this.props.model.save.bind(this.props.model)}
                                name={this.props.model.card.name}
                                description={this.props.model.card.description}
                                hasChanged={this.props.model.hasChanged}
                            />
                    </div>
            </div>
        )
    }
})

/* jshint ignore:end */
