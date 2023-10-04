import { Component } from "react";
import moment from "moment-timezone";
import _ from "underscore";
import { t } from "ttag";
import YearPicker from "metabase/components/YearPicker";
import { QuarterRoot } from "./DateQuarterYearWidget.styled";

// translator: this is a "moment" format string (https://momentjs.com/docs/#/displaying/format/) It should include "Q" for the quarter number, and raw text can be escaped by brackets. For eample "[Quarter] Q" will be rendered as "Quarter 1" etc
const QUARTER_FORMAT_STRING = t`[Q]Q`;

type Props = {
  value: string;
  setValue: (v: string) => void;
  onClose: () => void;
};

type State = {
  quarter: number | null;
  year: number;
};

class DateQuarterYearWidget extends Component<Props, State> {
  state: State = {
    quarter: null,
    year: moment().year(),
  };

  constructor(props: Props) {
    super(props);

    const initial = moment(this.props.value, "[Q]Q-YYYY");
    if (initial.isValid()) {
      this.state = {
        quarter: initial.quarter(),
        year: initial.year(),
      };
    } else {
      this.state = {
        quarter: null,
        year: moment().year(),
      };
    }
  }

  componentWillUnmount() {
    const { quarter, year } = this.state;
    if (quarter != null && year != null) {
      const value = moment().year(year).quarter(quarter).format("[Q]Q-YYYY");
      if (this.props.value !== value) {
        this.props.setValue(value);
      }
    }
  }

  render() {
    const { onClose } = this.props;
    const { quarter, year } = this.state;
    return (
      <div className="py2">
        <div className="flex flex-column align-center px1">
          <YearPicker
            value={year}
            onChange={year => this.setState({ year: year })}
          />
        </div>
        <ol
          className="flex flex-wrap bordered mx2 text-bold rounded"
          style={{ width: 150 }}
        >
          {_.range(1, 5).map(q => (
            <Quarter
              key={q}
              quarter={q}
              selected={q === quarter}
              onClick={() => this.setState({ quarter: q }, onClose)}
            />
          ))}
        </ol>
      </div>
    );
  }
}

interface QuarterProps {
  quarter: number;
  selected: boolean;
  onClick: () => void;
}

const Quarter = ({ quarter, selected, onClick }: QuarterProps) => (
  <QuarterRoot isSelected={selected} aria-selected={selected} onClick={onClick}>
    {moment().quarter(quarter).format(QUARTER_FORMAT_STRING)}
  </QuarterRoot>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DateQuarterYearWidget;
