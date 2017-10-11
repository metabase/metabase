import React from 'react'

import Card from 'metabase/components/Card'
import EntityMenuItem from 'metabase/components/EntityMenuItem'

export const component = 'Entity Menus'

export const description = `
    A menu with varios entity related options
`

export const examples = {
    'Edit menu': (
        <Card>
            <ol className="py1">
                <li>
                    <EntityMenuItem title="Edit this question" icon="pencil" />
                </li>
                <li>
                    <EntityMenuItem title="View revision history" icon="history" />
                </li>
                <li>
                    <EntityMenuItem title="Move" icon="move" />
                </li>
                <li>
                    <EntityMenuItem title="Archive" icon="archive" />
                </li>
            </ol>
        </Card>
    ),
    'Share menu': (
        <Card>
            <ol className="py1">
                <li>
                    <EntityMenuItem title="Add to dashboard" icon="pencil" />
                </li>
                <li>
                    <EntityMenuItem title="Download results" icon="download" />
                </li>
                <li>
                    <EntityMenuItem title="Sharing and embedding" icon="embedding" />
                </li>
            </ol>
        </Card>

    ),
    'More menu': (
        <Card>
            <ol className="py1">
                <li>
                    <EntityMenuItem title="Add to dashboard" icon="pencil" />
                </li>
                <li>
                    <EntityMenuItem title="Download results" icon="download" />
                </li>
                <li>
                    <EntityMenuItem title="Sharing and embedding" icon="embedding" />
                </li>
            </ol>
        </Card>
    )
}
