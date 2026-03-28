import './StatsCard.css';

export default function StatsCard({ icon, label, value, subtext, color = 'purple' }) {
  return (
    <div className={`stats-card glass-card animate-fade-in-up`}>
      <div className={`stats-card__icon stats-card__icon--${color}`}>
        {icon}
      </div>
      <div className="stats-card__content">
        <p className="stats-card__label">{label}</p>
        <h3 className="stats-card__value">{value}</h3>
        {subtext && <p className="stats-card__subtext">{subtext}</p>}
      </div>
    </div>
  );
}
