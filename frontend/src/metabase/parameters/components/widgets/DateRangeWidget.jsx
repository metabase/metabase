import React, { Component } from "react";

import Calendar from "metabase/components/Calendar.jsx";
import moment from "moment";

const SEPARATOR = "~"; // URL-safe

export default class DateRangeWidget extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            start: null,
            end: null
        };
    }

    static propTypes = {};
    static defaultProps = {};

    static format = (value) => {
        const [start,end] = (value || "").split(SEPARATOR);
        return start && end ? moment(start).format("MMMM D, YYYY") + " - " + moment(end).format("MMMM D, YYYY") : "";
    }

    componentWillMount() {
        this.componentWillReceiveProps(this.props);
    }

    componentWillReceiveProps(nextProps) {
        const [start, end] = (nextProps.value || "").split(SEPARATOR);
        this.setState({ start, end });
    }

    render() {
        const { start, end } = this.state;
        return (
            <div className="p1">
                <Calendar
                    initial={start ? moment(start) : null}
                    selected={start ? moment(start) : null}
                    selectedEnd={end ? moment(end) : null}
                    onChange={(start, end) => {
                        if (end == null) {
                            this.setState({ start, end });
                        } else {
                            this.props.setValue([start, end].join(SEPARATOR));
                        }
                    }}
                />
            </div>
        )
    }
}
