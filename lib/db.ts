import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  // Fallback for build time if env is missing
  console.warn('DATABASE_URL is not set. Database operations will fail.');
}

export const sql = neon(process.env.DATABASE_URL || 'postgresql://dummy:dummy@dummy/dummy');
// Forced reload to pick up new DATABASE_URL
