var FilterWidget = React.createClass({
    _updateTextFilterValue: function (index) {
        var value = this.refs.textFilterValue.getDOMNode().value;
        // we always know the index will 2 for the value of a filter
        this.props.updateFilter(value, 2, index);
    },
    _operatorList: function (open) {
        return (
            <div className="FilterSection">
                <SelectionModule
                    placeholder="..."
                    items={this.props.operatorList}
                    display='verbose_name'
                    selectedValue={this.props.operator}
                    selectedKey='name'
                    index={0}
                    isInitiallyOpen={open}
                    parentIndex={this.props.index}
                    action={this.props.updateFilter}
                />
            </div>
        );
    },
    render: function () {
        var fieldListOpen = true,
            operatorListHtml,
            canShowOperatorList = false,
            operatorListOpen = true,
            valueHtml,
            style = {
                fill: '#ddd'
            };

        if(this.props.field != null) {
            fieldListOpen = false,
            canShowOperatorList = true;
        }

        if(this.props.operator != null) {
            operatorListOpen = false;
        }

        if(canShowOperatorList) {
            operatorListHtml = this._operatorList(operatorListOpen);
        }

        if(this.props.valueFields) {
            if(this.props.valueFields.values) {
                // do some fixing up of the values so we can display true / false safely
                var values = this.props.valueFields.values.map(function(value) {
                    var safeValues = {}
                    for(var key in value) {
                        safeValues[key] = value[key].toString();
                    }
                    return safeValues;
                });

                valueHtml = (
                    <SelectionModule
                        placeholder="..."
                        items={values}
                        display='name'
                        selectedValue={this.props.value}
                        selectedKey='key'
                        index='2'
                        parentIndex={this.props.index}
                        isInitiallyOpen={false}
                        action={this.props.updateFilter}
                    />
                );
            } else {
                switch(this.props.valueFields.type) {
                    case 'date':
                        valueHtml = (
                            <DateFilter
                                date={this.props.value}
                                onChange={
                                    function (date) {
                                        this.props.updateFilter(date.format('YYYY-MM-DD'), 2, this.props.index)
                                    }.bind(this)
                                }
                            />
                        );
                        break;
                    default:
                        valueHtml = (
                            <input
                                className="input"
                                type="text"
                                defaultValue={this.props.value}
                                onChange={this._updateTextFilterValue.bind(null, this.props.index)}
                                ref="textFilterValue"
                                placeholder="What value?"
                            />
                        );
                }
            }
        }


        return (
            <div className="QueryFilter relative inline-block">
                <div className="FilterSection">
                    <SelectionModule
                        placeholder="Filter by..."
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
                {operatorListHtml}
                <div className="FilterSection">
                    {valueHtml}
                </div>
                <a className="RemoveTrigger" href="#" onClick={this.props.remove.bind(null, this.props.index)}>
                    <svg className="geomicon" data-icon="close" viewBox="0 0 32 32" style={style} width="16px" height="16px">
                        <path d="M4 8 L8 4 L16 12 L24 4 L28 8 L20 16 L28 24 L24 28 L16 20 L8 28 L4 24 L12 16 z "></path>
                    </svg>
                </a>
            </div>
        );
    }
});
