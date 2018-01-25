import React from 'react'
import faker from 'faker'

const FakeTable = () => {
    return (
        <table style={{ borderCollapse: 'collapse' }}>
            <thead style={{ borderBottom: '2px solid #ddd',}}>
                { Array.from(new Array(20)).map(i =>
                    <th style={{ padding: '0.5em', paddingLeft: '1em', paddingRight: '1em', textAlign: 'left' }}>
                        {faker.database.column()}
                    </th>
                )}
            </thead>
            <tbody>
                { Array.from(new Array(40)).map(r =>
                    <tr style={{ borderBottom: '1px solid #F3F5F5' }}>{
                        Array.from(new Array(20)).map(d =>
                            <td style={{ padding: '0.25em', color: '#616D75' }}>{faker.random.number()}</td>
                        )}
                    </tr>
                )}
            </tbody>
        </table>

    )
}

export default FakeTable
