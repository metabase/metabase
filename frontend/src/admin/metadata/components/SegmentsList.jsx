import React, { Component, PropTypes } from "react";

import SegmentItem from "./SegmentItem.jsx";

export default class SegmentsList extends Component {
    static propTypes = {};

    render() {
        let { table } = this.props;

        table.segments = [
            { id: "1", name: "Monthly New Users", rule: "Created At, Classification, and Email → Not Employee" },
            { id: "2", name: "Active Users", rule: "User ID → Last Login, Classification, and Email → Not Employee" },
            { id: "3", name: "Customers", rule: "Classification, Created At, and User ID → Total Purchases" },
            { id: "4", name: "Agents", rule: "Classification and Email → Not Employee" }
        ];

        return (
            <div className="mb4">
                <div className="flex mb1">
                    <h2 className="px1 text-purple">Segments</h2>
                    <a className="flex-align-right float-right text-bold text-brand no-decoration" href={"/admin/datamodel/segment/create?table="+table.id}>+ Add a Segment</a>
                </div>
                <table className="AdminTable">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th className="full">Rule</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {table.segments.map(segment =>
                            <SegmentItem
                                key={segment.id}
                                segment={segment}
                            />
                        )}
                    </tbody>
                </table>
            </div>
        );
    }
}
