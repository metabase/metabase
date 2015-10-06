import ColumnarSelector from "metabase/components/ColumnarSelector.react";
import Icon from "metabase/components/Icon.react";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.react";

export default React.createClass({
    displayName: "Select",
    propTypes: {
        value: React.PropTypes.any,
        options: React.PropTypes.array.isRequired,
        placeholder: React.PropTypes.string,
        onChange: React.PropTypes.func,
        optionNameFn: React.PropTypes.func,
        optionValueFn: React.PropTypes.func
    },

    getDefaultProps: function() {
        return {
            isInitiallyOpen: false,
            placeholder: "",
            optionNameFn: (option) => option.name,
            optionValueFn: (option) => option
        };
    },

    toggle: function() {
        this.refs.popover.toggle();
    },

    render: function() {
        var selectedName = this.props.value ? this.props.optionNameFn(this.props.value) : this.props.placeholder;

        var triggerElement = (
            <div className={"flex align-center " + (!this.props.value ? " text-grey-3" : "")}>
                <span className="mr1">{selectedName}</span>
                <Icon className="flex-align-right" name="chevrondown"  width="10" height="10"/>
            </div>
        );

        var sections = {};
        this.props.options.forEach(function (option) {
            var sectionName = option.section || "";
            sections[sectionName] = sections[sectionName] || { title: sectionName || undefined, items: [] };
            sections[sectionName].items.push(option);
        });
        sections = Object.keys(sections).map((sectionName) => sections[sectionName]);

        var columns = [
            {
                selectedItem: this.props.value,
                sections: sections,
                itemTitleFn: this.props.optionNameFn,
                itemDescriptionFn: (item) => item.description,
                itemSelectFn: (item) => {
                    this.props.onChange(this.props.optionValueFn(item))
                    this.toggle();
                }
            }
        ];

        return (
            <PopoverWithTrigger ref="popover"
                                className={this.props.className}
                                triggerElement={triggerElement}
                                triggerClasses={"AdminSelect " + (this.props.className || "")}>
                <ColumnarSelector columns={columns}/>
            </PopoverWithTrigger>
        );
    }

});
