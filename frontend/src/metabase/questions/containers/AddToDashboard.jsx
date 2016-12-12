import React from "react";

import Button from "metabase/components/Button.jsx";
import Icon from "metabase/components/Icon.jsx";

import Collections from "./CollectionList";
import ExpandingSearchField from "../components/ExpandingSearchField.jsx";

const AddToDashboard = () =>
    <div>
        <div className="px4 flex-full">
            <div className="py4 flex align-center mb3">
                <h1 className="ml-auto text-bold">Add question to dashboard?</h1>
                <Icon
                    className="ml-auto text-grey-4 cursor-pointer"
                    name="close"
                    width="36"
                    height="36"
                />
            </div>
            <div>
                <div className="py1 flex align-center">
                    <ExpandingSearchField />
                    <div className="ml-auto flex align-center">
                        <h5>Sort by</h5>
                        <Button borderless>
                            Last modified
                        </Button>
                        <Button borderless>
                            Alphabetical order
                        </Button>
                    </div>
                </div>
                <Collections>
                    { collections =>
                        <ol>
                            { collections.map((collection, index) =>
                                <li
                                    className="text-brand-hover flex align-center border-bottom cursor-pointer py1 mb1"
                                    key={index}
                                    onClick={() => console.log('select collection')}
                                >
                                    <Icon
                                        className="mr2"
                                        name="all"
                                        style={{ color: collection.color }}
                                    />
                                    <h3>{collection.name}</h3>
                                    <Icon
                                        className="ml-auto"
                                        name="chevronright"
                                    />
                                </li>
                            )}
                            <li className="text-brand-hover flex align-center border-bottom cursor-pointer py1 mb1">
                                    <Icon
                                        className="mr2"
                                        name="star"
                                    />
                                    <h3>Everything else</h3>
                                    <Icon
                                        className="ml-auto"
                                        name="chevronright"
                                    />
                            </li>
                        </ol>
                    }
                </Collections>
            </div>
        </div>
    </div>


export default AddToDashboard;
