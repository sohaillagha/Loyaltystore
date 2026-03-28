import { getTierClass, getTierIcon } from '../utils/formatters';

export default function TierBadge({ tier }) {
  return (
    <span className={`tier-badge ${getTierClass(tier)}`}>
      <span>{getTierIcon(tier)}</span>
      {tier}
    </span>
  );
}
