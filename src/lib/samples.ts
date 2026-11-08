import cleanCustomers from '../samples/clean-customers.csv?raw';
import messySales from '../samples/messy-sales.csv?raw';

export interface Sample {
  file: string;
  label: string;
  text: string;
}

/**
 * Bundled as raw text rather than fetched, so the samples work offline and a
 * reviewer never sees a broken "load sample" button.
 */
export const SAMPLES: Sample[] = [
  { file: 'messy-sales.csv', label: 'Messy sales export', text: messySales },
  { file: 'clean-customers.csv', label: 'Clean customer list', text: cleanCustomers },
];
