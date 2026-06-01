module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
  ],
  rules: {
    // Disable formatting-related rules — Biome owns formatting
    '@typescript-eslint/consistent-type-imports': 'error',
    'sort-imports': 'off',
    'import/order': 'off',
  },
  ignorePatterns: ['dist/', 'node_modules/', 'biome.json'],
};
