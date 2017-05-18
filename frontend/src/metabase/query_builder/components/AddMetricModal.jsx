import React, { Component } from "react";

import type {TableMetadata} from "metabase/meta/types/Metadata";
import ModalContent from "metabase/components/ModalContent";
import EmptyState from "metabase/components/EmptyState";

export default class AddMetricModal extends Component {
    props: {
        tableMetadata: TableMetadata,
        onClose: () => void
    };

    render() {
        const { onClose } = this.props;

        return (
            <ModalContent
                fullPageModal={true}
                onClose={onClose}
                className="bg-grey-0"
            >
                <div className="flex-full full ml-auto mr-auto pl1 pr1 mt2 mb2 flex align-center" style={{maxWidth: "1000px"}}>
                    <ol className="flex-full Grid Grid--guttersXXl Grid--full small-Grid--1of2">
                        <li className="Grid-cell">
                            <div className="bg-white p2 flex align-center rounded" style={{height: "500px", border: "1px solid #DCE1E4", boxShadow: "0 1px 3px 0 #DCE1E4"}}>
                                <EmptyState
                                    message={
                                        <div className="mt4">
                                            <h2 className="text-grey-5">Add a metric</h2>
                                            <p className="text-grey-4">We’ll show you saved metrics that are compatible with the metric you’re currently looking at.</p>
                                        </div>
                                    }
                                    image="/app/img/empty_dashboard"
                                    smallDescription
                                />
                            </div>
                        </li>
                        <li className="Grid-cell">
                            <div className="bg-white p2 flex align-center rounded" style={{height: "500px", border: "1px solid #DCE1E4", boxShadow: "0 1px 3px 0 #DCE1E4"}}>
                                <EmptyState
                                    message={
                                        <div className="mt4">
                                            <h2 className="text-grey-5">Create a new metric</h2>
                                            <p className="text-grey-4">Couldn’t find the thing you were looking for? If you want something done right, do it yourself, that’s your motto.</p>
                                        </div>
                                    }
                                    image="/app/img/empty_dashboard"
                                    smallDescription
                                />
                            </div>
                        </li>
                    </ol>
                </div>
            </ModalContent>
        )
    }
}
