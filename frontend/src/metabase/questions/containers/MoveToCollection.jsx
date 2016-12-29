import React from "react";

import Button from "metabase/components/Button";
import Icon from "metabase/components/Icon";

import Collections from "./CollectionList";

const MoveToCollection = () =>
    <div className="flex flex-column full-height">
        <div className="px4 flex-full">
            <div className="py4 flex align-center mb3">
                <h1 className="ml-auto text-bold">Which collection should this be in?</h1>
                <Icon
                    className="ml-auto text-grey-4 cursor-pointer"
                    name="close"
                    width="36"
                    height="36"
                />
            </div>
            <Collections>
                { collections =>
                    <ol className="ml-auto mr-auto" style={{ width: 520 }}>
                        <li className="flex align-center mb1">
                            <Icon
                                className="mr2"
                                name="all"
                                style={{ visibility: 'hidden' }}
                            />
                            <h3>None</h3>
                        </li>
                        { collections.map((collection, index) =>
                            <li
                                className="flex align-center mb1"
                                key={index}
                                onClick={() => console.log('select collection')}
                            >
                                <Icon
                                    className="mr2"
                                    name="all"
                                    style={{ color: collection.color }}
                                />
                                <h3>{collection.name}</h3>
                            </li>
                        )}
                    </ol>
                }
            </Collections>
        </div>
        <div className="border-top flex p4">
            <div className="ml-auto">
                <Button
                    className="mr1"
                >
                    Cancel
                </Button>
                <Button
                    primary
                >
                    Move
                </Button>
            </div>
        </div>
    </div>


export default MoveToCollection;
