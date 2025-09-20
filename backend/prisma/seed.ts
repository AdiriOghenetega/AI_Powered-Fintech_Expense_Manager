import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  // Create default categories
  const categories = [
    { name: 'Food & Dining', description: 'Restaurants and groceries', color: '#10B981', icon: 'utensils', isDefault: true },
    { name: 'Transportation', description: 'Gas, rideshares, public transport', color: '#3B82F6', icon: 'car', isDefault: true },
    { name: 'Shopping', description: 'Clothing, electronics, retail', color: '#8B5CF6', icon: 'shopping-bag', isDefault: true },
    { name: 'Entertainment', description: 'Movies, games, subscriptions', color: '#F59E0B', icon: 'film', isDefault: true },
    { name: 'Bills & Utilities', description: 'Rent, electricity, internet', color: '#EF4444', icon: 'receipt', isDefault: true },
    { name: 'Healthcare', description: 'Medical expenses', color: '#06B6D4', icon: 'heart', isDefault: true },
    { name: 'Other', description: 'Miscellaneous expenses', color: '#6B7280', icon: 'more-horizontal', isDefault: true },
  ];

  for (const category of categories) {
    await prisma.category.upsert({
      where: { name: category.name },
      update: {},
      create: category,
    });
  }

  // Create demo user
  const hashedPassword = await bcrypt.hash('demo123456', 12);
  
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@fintech.com' },
    update: {},
    create: {
      email: 'demo@fintech.com',
      passwordHash: hashedPassword,
      firstName: 'Demo',
      lastName: 'User',
      emailVerified: true,
    },
  });

  console.log('Seed completed successfully!');
  console.log('Demo user: demo@fintech.com / demo123456');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
