import React from "react";

function AdminContentTable({columnTitles, children}) {
    return (
        <table className="ContentTable">
            <thead>
                <tr>
                    {columnTitles && columnTitles.map((title, index) =>
                        <th key={index}>{title}</th>
                     )}
                </tr>
            </thead>
            <tbody>
                {children}
            </tbody>
        </table>
    );
}

export default AdminContentTable;
