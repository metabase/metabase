import React, { Component } from "react";

import type {TableMetadata} from "metabase/meta/types/Metadata";
import ModalContent from "metabase/components/ModalContent";
import EmptyState from "metabase/components/EmptyState";

const AddMetricButton = ({ image, title, description }) =>
    <div className="bg-white p2 flex align-center rounded" style={{height: "500px", border: "1px solid #DCE1E4", boxShadow: "0 1px 3px 0 #DCE1E4"}}>
        <EmptyState
            message={
                <div className="mt4">
                    <h2 className="text-grey-5">{title}</h2>
                    <p className="text-grey-4">{description}</p>
                </div>
            }
            image={image}
            smallDescription
        />
    </div>;

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
                <div className="flex-full full ml-auto mr-auto pl1 pr1 mt2 mb2 flex align-center"
                     style={{maxWidth: "1000px"}}>
                    <ol className="flex-full Grid Grid--guttersXXl Grid--full small-Grid--1of2">
                        <li className="Grid-cell">
                            <AddMetricButton
                                image="/app/img/empty_dashboard"
                                title="Add a metric"
                                description="We’ll show you saved metrics that are compatible with the metric you’re currently looking at."
                            />
                        </li>
                        <li className="Grid-cell">
                            <AddMetricButton
                                image="/app/img/empty_dashboard"
                                title="Create a new metric"
                                description="Couldn’t find the thing you were looking for? If you want something done right, do it yourself, that’s your motto."
                            />
                        </li>
                    </ol>
                </div>
            </ModalContent>
        )
    }
}
