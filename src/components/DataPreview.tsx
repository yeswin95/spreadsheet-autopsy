interface DataPreviewProps {
  headers: string[];
  rows: string[][];
}

export default function DataPreview({ headers, rows }: DataPreviewProps) {
  return (
    <div className="preview" tabIndex={0} role="region" aria-label="Data preview">
      <table>
        <thead>
          <tr>
            <th className="preview__index" scope="col">
              #
            </th>
            {headers.map((header, index) => (
              <th key={`${header}-${index}`} scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              <td className="preview__index">{rowIndex + 1}</td>
              {headers.map((_, columnIndex) => {
                const value = (row[columnIndex] ?? '').trim();
                return (
                  <td key={columnIndex} className={value === '' ? 'preview__blank' : undefined}>
                    {value === '' ? '·' : value}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
