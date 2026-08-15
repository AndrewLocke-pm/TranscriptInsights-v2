export const defaultPMSchema = {
  categories: [
    {
      key: 'decisions',
      name: 'Decisions',
      description: 'Things that were actually agreed, not just discussed.',
      fields: [
        { name: 'decision', type: 'string' },
        { name: 'context', type: 'string' },
      ],
    },
    {
      key: 'action_items',
      name: 'Action Items',
      description: 'Tasks with an owner. Use "Unassigned" if the owner is unclear.',
      fields: [
        { name: 'owner', type: 'string' },
        { name: 'task', type: 'string' },
        { name: 'due', type: 'string or null' },
      ],
    },
    {
      key: 'risks_and_blockers',
      name: 'Risks and Blockers',
      description: 'Real concerns raised in the transcript, not generic warnings.',
      fields: [
        { name: 'risk', type: 'string' },
        { name: 'raised_by', type: 'string or null' },
        { name: 'severity', type: 'high|medium|low' },
      ],
    },
    {
      key: 'user_needs',
      name: 'User Needs',
      description: 'Verbatim or near-verbatim needs stated by users in the transcript.',
      fields: [
        { name: 'need', type: 'string' },
        { name: 'source_quote', type: 'string' },
      ],
    },
  ],
}
