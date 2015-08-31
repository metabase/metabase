'use strict';

import RadioSelect from 'metabase/components/RadioSelect.react';
import moment from 'moment';

export default class SortableItemList extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            sort: props.initialSort || "Last Modified"
        };
    }

    onClickItem(item) {
        if (this.props.onClickItemFn) {
            this.props.onClickItemFn(item);
        }
    }

    render() {
        var items;
        if (this.state.sort === "Last Modified") {
            items = this.props.items.slice().sort((a, b) => a.updated_at < b.updated_at);
        } else if (this.state.sort === "Alphabetical Order") {
            items = this.props.items.slice().sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
        }

        return (
            <div className="SortableItemList">
                <div className="flex align-center px2 pb3 border-bottom">
                    <h5 className="text-bold text-uppercase text-grey-3 ml2 mr2">Sort by</h5>
                    <RadioSelect
                        value={this.state.sort}
                        options={["Last Modified", /*"Most Popular",*/  "Alphabetical Order"]}
                        onChange={(sort) => this.setState({ sort })}
                    />
                </div>

                <ul className="SortableItemList-list px2 pb2">
                    {items.map(item =>
                        <li key={item.id} className="border-row-divider">
                            <a className="no-decoration flex p2" href="#" onClick={() => this.onClickItem(item)}>
                                <div className="flex align-center flex-full mr2">
                                    {this.props.showIcons ?
                                        <div><img className="mr2" style={{height: "48px"}}  src={"/app/components/icons/assets/" + item.icon + ".png"} /></div>
                                    : null}
                                    <div className="text-brand-hover">
                                        <h3 className="mb1">{item.name}</h3>
                                        <h4 className="text-grey-3">{item.description || "No description yet"}</h4>
                                    </div>
                                </div>
                                <div className="flex-align-right text-right text-grey-3">
                                    <div className="mb1">Saved by {item.creator.common_name}</div>
                                    <div>Modified {item.updated_at.fromNow()}</div>
                                </div>
                            </a>
                        </li>
                    )}
                </ul>
            </div>
        );
    }
}

SortableItemList.propTypes = {
    items: React.PropTypes.array.isRequired,
    clickItemFn: React.PropTypes.func,
    showIcons: React.PropTypes.bool
};
