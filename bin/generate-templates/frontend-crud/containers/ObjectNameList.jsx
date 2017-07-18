import React, { Component } from "react";
import { connect } from "react-redux";
import { Link } from "react-router";

import Button from "metabase/components/Button";
import Confirm from "metabase/components/Confirm";

import { load${ObjectNamePlural}, delete${ObjectName} } from "../duck";

const mapStateToProps = (state, props) => ({
    ${object_name_plural}: Object.values(state.${object_name}.${object_name_plural})
})

const mapDispatchToProps = {
    load${ObjectNamePlural},
    delete${ObjectName}
}

@connect(mapStateToProps, mapDispatchToProps)
export default class ${ObjectName}List extends Component {
    componentWillMount() {
        this.props.load${ObjectNamePlural}();
    }

    render() {
        const { ${object_name_plural} } = this.props;
        return (
            <div className="m2">
                { ${object_name_plural}.length > 0 ?
                    <table className="mb2">
                        <thead>
                            <tr>
                                {Object.keys(${object_name_plural}[0]).map(key =>
                                    <th>{key}</th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {${object_name_plural}.map(${object_name} =>
                                <tr>
                                    {Object.values(${object_name}).map(value =>
                                        <td>{value}</td>
                                    )}
                                    <td>
                                        <Link to={"/${object_name}/" + ${object_name}.id}>
                                            <Button primary small>Edit</Button>
                                        </Link>
                                    </td>
                                    <td>
                                        <Confirm
                                            title="Delete this ${object_name}?"
                                            action={() => this.props.delete${ObjectName}(${object_name}.id)}
                                        >
                                            <Button warning small>Delete</Button>
                                        </Confirm>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                :
                    <div className="mb2">No ${object_name_plural}</div>
                }
                <div>
                    <Link to="/${object_name}/create">
                        <Button primary>Create ${ObjectName}</Button>
                    </Link>
                </div>
            </div>
        );
    }
}
